"""bike-my-day AWS infrastructure (CDK), the same shape as isabelle:

- BikeMyDayCert (us-east-1): the CloudFront certificate.
- BikeMyDay (eu-north-1): S3 + CloudFront for the static app at
  bike-my-day.korist.se, with /api/* proxied to api.bike-my-day.korist.se, which
  is Caddy -> uvicorn on 127.0.0.1:8004 on the shared dev box.

The box is the KoristDev stack (repo korist-infra). This stack only adds DNS for
it, a deploy bucket and a backup bucket its role may use, and permission to send
the login mail through SES as korist.se. It reads the instance id, Elastic IP
and role name from KoristDev at synth time.

Runtime secrets are not here: CloudFormation cannot create SecureStrings. They
live at /bike-my-day/env, put there by scripts/push-env.sh.

The production name is a hand-made A record pointing at Vercel until cutover.
A deploy without `-c cutover=true` leaves it alone; the app is then reachable on
the distribution's *.cloudfront.net name for testing.
"""

# pyright: reportArgumentType=false

import os

import aws_cdk as cdk
import boto3
from aws_cdk import Stack
from aws_cdk import aws_certificatemanager as acm
from aws_cdk import aws_cloudfront as cloudfront
from aws_cdk import aws_cloudfront_origins as origins
from aws_cdk import aws_iam as iam
from aws_cdk import aws_route53 as route53
from aws_cdk import aws_route53_targets as targets
from aws_cdk import aws_s3 as s3
from aws_cdk import aws_s3_deployment as s3deploy
from constructs import Construct

ACCOUNT = os.environ.get("CDK_DEFAULT_ACCOUNT")
if not ACCOUNT:
    raise SystemExit("No AWS account: run through the `cdk` CLI with credentials available.")

REGION = "eu-north-1"
ZONE_NAME = "korist.se"
DOMAIN = "bike-my-day.korist.se"
API_DOMAIN = "api.bike-my-day.korist.se"
MAIL_IDENTITY = "korist.se"  # verified SES domain identity, shared by the korist apps
SERVER_STACK = "KoristDev"  # the dev box, owned by korist-infra

# Single-page app: any path that is not a file gets index.html and the router
# decides. A viewer-request function rather than CloudFront error responses,
# because those would also turn the API's own 404s into index.html with a 200.
SPA_REWRITE = """
function handler(event) {
  var request = event.request;
  if (request.uri.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
"""


def server_facts() -> dict[str, str]:
    """Instance id, public IP and IAM role name of the shared box."""
    cfn = boto3.client("cloudformation", region_name=REGION)
    outputs = {
        o["OutputKey"]: o["OutputValue"]
        for o in cfn.describe_stacks(StackName=SERVER_STACK)["Stacks"][0]["Outputs"]
    }
    ec2 = boto3.client("ec2", region_name=REGION)
    reservation = ec2.describe_instances(InstanceIds=[outputs["OutInstanceId"]])
    profile_arn = reservation["Reservations"][0]["Instances"][0]["IamInstanceProfile"]["Arn"]
    profile_name = profile_arn.rsplit("/", 1)[1]
    role_name = boto3.client("iam").get_instance_profile(InstanceProfileName=profile_name)[
        "InstanceProfile"
    ]["Roles"][0]["RoleName"]
    return {
        "instance_id": outputs["OutInstanceId"],
        "public_ip": outputs["OutServerPublicIp"],
        "role_name": role_name,
    }


class CertStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        zone = route53.HostedZone.from_lookup(self, "Zone", domain_name=ZONE_NAME)
        self.cert = acm.Certificate(
            self,
            "WebCert",
            domain_name=DOMAIN,
            validation=acm.CertificateValidation.from_dns(zone),
        )


class BikeMyDayStack(Stack):
    def __init__(
        self, scope: Construct, construct_id: str, cert: acm.ICertificate, **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        zone = route53.HostedZone.from_lookup(self, "Zone", domain_name=ZONE_NAME)
        server = server_facts()

        # --- Server side: code and backup buckets, SES, DNS for the box ---
        deploy_bucket = s3.Bucket(
            self,
            "DeployBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=cdk.RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        # The database is tiny but irreplaceable: every rider's push subscriptions.
        backup_bucket = s3.Bucket(
            self,
            "BackupBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            removal_policy=cdk.RemovalPolicy.RETAIN,
            lifecycle_rules=[s3.LifecycleRule(prefix="db/", expiration=cdk.Duration.days(30))],
        )
        # Not "ServerRole": several stacks grant on one box role, and CDK names the
        # inline policy after the construct path, so they would overwrite each other.
        role = iam.Role.from_role_name(self, "BikeMyDayServerRole", server["role_name"])
        deploy_bucket.grant_read(role)
        backup_bucket.grant_read_write(role)
        role.add_to_principal_policy(
            iam.PolicyStatement(
                actions=["ses:SendEmail"],
                resources=[
                    f"arn:aws:ses:{REGION}:{self.account}:identity/{MAIL_IDENTITY}"
                ],
            )
        )
        # Reading /bike-my-day/* needs no grant: the instance has
        # AmazonSSMManagedInstanceCore, which allows ssm:GetParameter on *.

        route53.ARecord(
            self,
            "ApiDns",
            zone=zone,
            record_name=API_DOMAIN,
            target=route53.RecordTarget.from_ip_addresses(server["public_ip"]),
            ttl=cdk.Duration.minutes(5),
        )

        # --- Web app: S3 + CloudFront, /api proxied to the server ---
        web_bucket = s3.Bucket(
            self,
            "WebBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=cdk.RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        api_behavior = cloudfront.BehaviorOptions(
            origin=origins.HttpOrigin(
                API_DOMAIN, protocol_policy=cloudfront.OriginProtocolPolicy.HTTPS_ONLY
            ),
            allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
            cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
            # Not ALL_VIEWER: Caddy picks the site by Host, which must be the origin's.
            origin_request_policy=cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        )
        s3_origin = origins.S3BucketOrigin.with_origin_access_control(web_bucket)
        # The service worker must never be served stale: a phone stuck on an old
        # worker is painful to fix. Browsers already skip their HTTP cache for it
        # (updateViaCache: "none"); this keeps the edge from caching it too.
        sw_behavior = cloudfront.BehaviorOptions(
            origin=s3_origin,
            viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
        )
        distribution = cloudfront.Distribution(
            self,
            "Web",
            default_root_object="index.html",
            domain_names=[DOMAIN],
            certificate=cert,
            default_behavior=cloudfront.BehaviorOptions(
                origin=s3_origin,
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                function_associations=[
                    cloudfront.FunctionAssociation(
                        event_type=cloudfront.FunctionEventType.VIEWER_REQUEST,
                        function=cloudfront.Function(
                            self,
                            "SpaRewrite",
                            code=cloudfront.FunctionCode.from_inline(SPA_REWRITE),
                            runtime=cloudfront.FunctionRuntime.JS_2_0,
                        ),
                    )
                ],
            ),
            additional_behaviors={"/api/*": api_behavior, "/sw.js": sw_behavior},
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,
        )
        s3deploy.BucketDeployment(
            self,
            "WebDeploy",
            # The Vite build output: `npm run build` in apps/web must run first.
            sources=[s3deploy.Source.asset("../apps/web/dist")],
            destination_bucket=web_bucket,
            distribution=distribution,
            # Vite fingerprints assets, so only index.html, sw.js and the manifest
            # change in place; a short max-age gets a deploy to users on the next open.
            cache_control=[s3deploy.CacheControl.max_age(cdk.Duration.minutes(5))],
        )

        if self.node.try_get_context("cutover") == "true":
            route53.ARecord(
                self,
                "WebDns",
                zone=zone,
                record_name=DOMAIN,
                target=route53.RecordTarget.from_alias(targets.CloudFrontTarget(distribution)),
                # The record is hand-made and points at Vercel until now.
                delete_existing=True,
            )

        cdk.CfnOutput(self, "OutInstanceId", value=server["instance_id"])
        cdk.CfnOutput(self, "OutDeployBucket", value=deploy_bucket.bucket_name)
        cdk.CfnOutput(self, "OutBackupBucket", value=backup_bucket.bucket_name)
        cdk.CfnOutput(self, "OutCloudFrontUrl", value=f"https://{distribution.domain_name}")
        cdk.CfnOutput(self, "OutWebUrl", value=f"https://{DOMAIN}")


app = cdk.App()
cert_stack = CertStack(
    app,
    "BikeMyDayCert",
    env=cdk.Environment(account=ACCOUNT, region="us-east-1"),
    cross_region_references=True,
)
BikeMyDayStack(
    app,
    "BikeMyDay",
    cert=cert_stack.cert,
    env=cdk.Environment(account=ACCOUNT, region=REGION),
    cross_region_references=True,
)
app.synth()
