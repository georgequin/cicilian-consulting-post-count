export default function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <main className="login-wrap">
      <div className="login">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand" src="/logo.png" alt="Cecilia Consulting" width={534} height={125} />
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
