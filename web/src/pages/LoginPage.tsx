import { Dices } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PageTransition } from "../components/PageTransition";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useAuthConfig } from "../hooks/useAuthConfig";
import { useDisplayName } from "../hooks/useSettings";
import { useAuth } from "../lib/AuthContext";
import { checkHealth, login, type RateLimitError } from "../lib/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const displayName = useDisplayName();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: authConfig } = useAuthConfig();

  const oidcEnabled = authConfig?.oidcEnabled ?? false;
  const disableLocalAuth = authConfig?.disableLocalAuth ?? false;
  const oidcButtonLabel = authConfig?.oidcButtonLabel || "Sign in with SSO";

  const redirectParam = searchParams.get("redirect");
  const errorParam = searchParams.get("error");
  const oidcLoginUrl = redirectParam
    ? `/api/auth/oidc/login?redirect=${encodeURIComponent(redirectParam)}`
    : "/api/auth/oidc/login";

  useEffect(() => {
    const key = "_expiredRedirect";
    if (sessionStorage.getItem(key)) {
      toast.warning("Session expired — please sign in again");
      sessionStorage.removeItem(key);
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(username, password);
      setUser(user);
      navigate(searchParams.get("redirect") ?? "/");
    } catch (err) {
      const rateLimited = err as Partial<RateLimitError>;
      if (rateLimited.status === 429) {
        const secs = rateLimited.retryAfter ?? null;
        setError(
          secs
            ? `Too many failed attempts — try again in ${secs} seconds`
            : "Too many failed attempts — try again later",
        );
      } else {
        const healthy = await checkHealth();
        setError(
          healthy ? "Invalid username or password" : "Service unavailable — please try again later",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageTransition>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Dices size={28} className="text-primary" />
              <span className="text-3xl font-display font-bold text-primary">{displayName}</span>
            </div>
            <p className="text-muted-foreground mt-2">Sign in to continue</p>
          </div>

          {errorParam && (
            <div
              role="alert"
              className="p-3 text-sm text-destructive bg-destructive/10 rounded-md text-center"
            >
              {errorParam === "access_denied"
                ? "Sign in was cancelled or access was denied."
                : "Single Sign-On failed — please try again."}
            </div>
          )}

          {disableLocalAuth ? (
            <div className="space-y-4">
              <Button asChild className="w-full" size="lg">
                <a href={oidcLoginUrl}>{oidcButtonLabel}</a>
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="username" className="text-sm font-medium">
                    Username
                  </label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" isLoading={loading}>
                  Sign in
                </Button>
              </form>

              {oidcEnabled && (
                <>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or</span>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="w-full">
                    <a href={oidcLoginUrl}>{oidcButtonLabel}</a>
                  </Button>
                </>
              )}

              <p className="text-sm text-center">
                <Link to="/forgot-password" className="text-primary hover:underline">
                  Forgot your password?
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
