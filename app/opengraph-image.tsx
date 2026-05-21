import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Maporia - Places locals love";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#879846",
          color: "#FFFFFF",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, #7B8D35 0%, #8F9E4F 52%, #6F8030 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 82% 16%, rgba(255,255,255,0.20) 0, rgba(255,255,255,0) 280px), radial-gradient(circle at 12% 88%, rgba(255,255,255,0.12) 0, rgba(255,255,255,0) 320px)",
          }}
        />

        <div
          style={{
            position: "absolute",
            right: 54,
            top: 58,
            width: 500,
            height: 500,
            borderRadius: 54,
            overflow: "hidden",
            border: "2px solid rgba(255,255,255,0.30)",
            boxShadow: "0 28px 70px rgba(31,42,31,0.30)",
            display: "flex",
          }}
        >
          <img
            src="https://www.maporia.co/florida-map.png"
            alt=""
            width={500}
            height={500}
            style={{
              objectFit: "cover",
              width: "100%",
              height: "100%",
              opacity: 0.92,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(31,42,31,0.10))",
            }}
          />
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "72px 80px",
            width: "620px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 42,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#879846",
                fontSize: 30,
                fontWeight: 800,
              }}
            >
              M
            </div>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 700 }}>
              Maporia
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 108,
              lineHeight: 0.92,
              fontWeight: 900,
              letterSpacing: 0,
              maxWidth: 560,
            }}
          >
            Places locals love.
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 34,
              fontSize: 34,
              lineHeight: 1.22,
              color: "rgba(255,255,255,0.88)",
              maxWidth: 560,
            }}
          >
            Local places, experiences, and services across Florida.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
