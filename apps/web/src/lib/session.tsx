import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, getToken, type Me, type Profile, setToken, setUnauthorizedHandler } from "./api";
import { releaseDevice, syncSubscription } from "./push";

type Session =
  | { status: "loading" }
  | { status: "signed-out" }
  /** Have a token but could not reach the server. */
  | { status: "offline" }
  | { status: "signed-in"; me: Me };

type SessionContext = {
  session: Session;
  /** After a successful code verification. */
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-read /api/me, e.g. after saving preferences. */
  refresh: () => Promise<void>;
  setProfile: (profile: Profile) => void;
};

const Context = createContext<SessionContext | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() =>
    getToken() ? { status: "loading" } : { status: "signed-out" },
  );

  const load = useCallback(async () => {
    if (!getToken()) {
      setSession({ status: "signed-out" });
      return;
    }
    try {
      const me = await api<Me>("/me");
      // Sliding expiry: every open swaps in a fresh token.
      setToken(me.token);
      setSession({ status: "signed-in", me });
      void syncSubscription();
    } catch {
      // A 401 already cleared the token; anything else keeps it for a retry.
      setSession({ status: getToken() ? "offline" : "signed-out" });
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession({ status: "signed-out" }));
    void load();
  }, [load]);

  const value = useMemo<SessionContext>(
    () => ({
      session,
      signIn: async (token) => {
        setToken(token);
        await load();
      },
      signOut: async () => {
        await releaseDevice();
        setToken(null);
        setSession({ status: "signed-out" });
      },
      refresh: load,
      setProfile: (profile) =>
        setSession((s) => (s.status === "signed-in" ? { ...s, me: { ...s.me, profile } } : s)),
    }),
    [session, load],
  );

  return <Context value={value}>{children}</Context>;
}

export function useSession(): SessionContext {
  const ctx = use(Context);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
