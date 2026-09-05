"""bike-my-day AWS infrastructure (CDK).

One stack, in eu-north-1. Much smaller than the isabelle/snicksnack stacks
because there is no S3 site and no CloudFront: every route in this app is
server-rendered and carries an auth cookie, so there is nothing worth caching
at an edge and a cache-policy mistake would serve one rider's dashboard to
another. TLS is Caddy's job, via Let's Encrypt, on the box itself.

The box belongs to the Snicksnack stack. This stack only adds a deploy bucket
its instance role may read, plus DNS, and reads the instance id, Elastic IP and
role name out of the Snicksnack stack at synth time.

Runtime secrets are NOT here: CloudFormation cannot create SecureStrings, and a
plaintext parameter in a template is a plaintext parameter in the deploy logs.
They live at /bike-my-day/env, put there by scripts/push-env.sh.
"""

# pyright: reportArgumentType=false

import os

import aws_cdk as cdk
import boto3
from aws_cdk import Stack
from aws_cdk import aws_iam as iam
from aws_cdk import aws_route53 as route53
from aws_cdk import aws_s3 as s3
from constructs import Construct

ACCOUNT = os.environ.get("CDK_DEFAULT_ACCOUNT")
if not ACCOUNT:
    raise SystemExit("No AWS account: run through the `cdk` CLI with credentials available.")

REGION = "eu-north-1"
ZONE_NAME = "korist.se"
DOMAIN = "bike-my-day.korist.se"
# A permanent second name for the same box. Caddy serves the app on both, so
# the whole path — DNS, Let's Encrypt, Caddy, systemd, Supabase — can be proven
# end to end before the name riders actually use is pointed anywhere new, and
# stays reachable afterwards when the production name is misbehaving.
ORIGIN_DOMAIN = "origin.bike-my-day.korist.se"
SERVER_STACK = "Snicksnack"


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


class BikeMyDayStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        zone = route53.HostedZone.from_lookup(self, "Zone", domain_name=ZONE_NAME)
        server = server_facts()

        # Releases are ~15 MB tarballs and only the newest is ever fetched, but
        # keeping a few days of them makes "roll back to Tuesday" a download
        # rather than a rebuild.
        deploy_bucket = s3.Bucket(
            self,
            "DeployBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            versioned=True,
            removal_policy=cdk.RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            lifecycle_rules=[
                s3.LifecycleRule(noncurrent_version_expiration=cdk.Duration.days(14))
            ],
        )
        role = iam.Role.from_role_name(self, "ServerRole", server["role_name"])
        deploy_bucket.grant_read(role)
        # Reading /bike-my-day/* needs no grant here: the instance already has
        # AmazonSSMManagedInstanceCore, which allows ssm:GetParameter on *, and
        # decrypting the SecureString under the AWS-managed key needs nothing
        # further. Verified from the box in #59.

        route53.ARecord(
            self,
            "OriginDns",
            zone=zone,
            record_name=ORIGIN_DOMAIN,
            target=route53.RecordTarget.from_ip_addresses(server["public_ip"]),
            ttl=cdk.Duration.minutes(5),
        )

        # The production name was a hand-made A record pointing at Vercel's
        # anycast IP, so the first deploy that owns it has to delete that one.
        # Deploy with `-c cutover=false` to stand everything up and verify it on
        # ORIGIN_DOMAIN while riders are still being served by Vercel.
        if self.node.try_get_context("cutover") != "false":
            route53.ARecord(
                self,
                "WebDns",
                zone=zone,
                record_name=DOMAIN,
                target=route53.RecordTarget.from_ip_addresses(server["public_ip"]),
                # Short, so a bad cutover is five minutes from being undone.
                ttl=cdk.Duration.minutes(5),
                delete_existing=True,
            )

        cdk.CfnOutput(self, "OutInstanceId", value=server["instance_id"])
        cdk.CfnOutput(self, "OutDeployBucket", value=deploy_bucket.bucket_name)
        cdk.CfnOutput(self, "OutOriginUrl", value=f"https://{ORIGIN_DOMAIN}")
        cdk.CfnOutput(self, "OutWebUrl", value=f"https://{DOMAIN}")


app = cdk.App()
BikeMyDayStack(app, "BikeMyDay", env=cdk.Environment(account=ACCOUNT, region=REGION))
app.synth()
