import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const dot = { width: 22, height: 22, borderRadius: 11, background: "#fff" } as const;
  const bar = (w: number) => ({ width: w, height: 12, borderRadius: 6, background: "rgba(255,255,255,.85)" }) as const;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#1f5fa8", display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, padding: "0 42px" }}>
        {[64, 76, 54].map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={dot} />
            <div style={bar(w)} />
          </div>
        ))}
      </div>
    ),
    size
  );
}
