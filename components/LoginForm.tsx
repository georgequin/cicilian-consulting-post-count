"use client";

import { useState } from "react";

export default function LoginForm({ viewLocked }: { viewLocked: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return setError("Enter the password.");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't log in. Try again.");
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("No connection. Check your internet and try again.");
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login" onSubmit={submit}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand" src="/logo.png" alt="Cecilia Consulting" width={534} height={125} />
        <h1>Social media Post Log</h1>
        <p className="summary" style={{ margin: 0 }}>
          {viewLocked
            ? "Enter your password. Viewers can scroll the log; the editor can also log posts."
            : "Enter the editor password to log and edit posts."}
        </p>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Checking…" : "Log in"}
        </button>
        {!viewLocked && (
          <a href="/" className="hint" style={{ textAlign: "center" }}>
            Back to the log
          </a>
        )}
      </form>
    </main>
  );
}
