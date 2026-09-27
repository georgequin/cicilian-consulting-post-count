export default function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <main className="login-wrap">
      <div className="login">
        <span className="eyebrow">Cecilia Consulting</span>
        <h1>Almost ready</h1>
        <div className="notice">
          Add these environment variables in your Vercel project settings, then redeploy:
          <ul>
            {missing.map((m) => (
              <li key={m}>
                <code>{m}</code>
              </li>
            ))}
          </ul>
          The README explains where each one comes from.
        </div>
      </div>
    </main>
  );
}
