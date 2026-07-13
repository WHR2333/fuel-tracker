// Login page — standalone (outside ShellOutlet). Validates credentials
// against the server and stores the JWT on success.

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { login, isAuthenticated, LoginError } from "@/lib/auth";
import { Eye, EyeOff } from "lucide-react";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPwd, setShowPwd] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Already logged in? Go straight to the app.
  React.useEffect(() => {
    if (isAuthenticated()) navigate("/", { replace: true });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof LoginError) {
        if (err.status === 429) {
          setError(err.message); // "Too many failed attempts…"
        } else {
          setError("用户名或密码错误");
        }
      } else {
        setError("网络错误，请稍后再试");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "1rem",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--card)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-lg)",
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        {/* Logo / title */}
        <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
          <img
            src="/favicon.png"
            alt="Logo"
            style={{ display: "block", width: 80, height: 80, margin: "0 auto 0.75rem" }}
          />
          <h1 style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text)", margin: 0 }}>
            省油的灯
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text2)", marginTop: "0.25rem" }}>
            请登录以继续
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              background: "color-mix(in srgb, var(--red) 12%, transparent)",
              color: "var(--red)",
              borderRadius: 8,
              padding: "0.6rem 0.8rem",
              fontSize: "0.85rem",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* Username */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text)" }}>用户名</span>
          <input
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="login-input"
          />
        </label>

        {/* Password */}
        <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text)" }}>密码</span>
          <div style={{ position: "relative" }}>
            <input
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              style={{ paddingRight: "2.5rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text2)",
                padding: 4,
                display: "flex",
              }}
              tabIndex={-1}
            >
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: "0.5rem",
            padding: "0.7rem",
            borderRadius: 8,
            border: "none",
            background: loading ? "var(--text2)" : "var(--accent)",
            color: "#fff",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            transition: "opacity 0.15s",
          }}
        >
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
    </div>
  );
}
