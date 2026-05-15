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
          background: "#FAFAF7",
          color: "#16190F",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 82% 18%, rgba(143,158,79,0.36) 0, rgba(143,158,79,0) 280px), radial-gradient(circle at 8% 86%, rgba(241,214,150,0.46) 0, rgba(241,214,150,0) 300px), linear-gradient(135deg, #FAFAF7 0%, #F1ECE0 55%, #E8EDD7 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            right: 72,
            top: 70,
            width: 430,
            height: 430,
            borderRadius: 52,
            overflow: "hidden",
            border: "1px solid rgba(31,42,31,0.12)",
            display: "flex",
          }}
        >
          <img
            src="https://www.maporia.co/florida-map.png"
            alt=""
            width={430}
            height={430}
            style={{
              objectFit: "cover",
              width: "100%",
              height: "100%",
              opacity: 0.86,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(250,250,247,0.08), rgba(250,250,247,0.28))",
            }}
          />
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "74px 80px",
            width: "720px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginBottom: 58,
            }}
          >
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: "50%",
                background: "#81904C",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FAFAF7",
                fontSize: 34,
                fontWeight: 800,
              }}
            >
              M
            </div>
            <div style={{ display: "flex", fontSize: 42, fontWeight: 800 }}>
              Maporia
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 76,
              lineHeight: 0.95,
              fontWeight: 900,
              maxWidth: 650,
            }}
          >
            Discover local gems across Florida.
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 30,
              fontSize: 28,
              lineHeight: 1.35,
              color: "#4A4F3D",
              maxWidth: 610,
            }}
          >
            Places, experiences, and services handpicked by locals.
          </div>

          <div
            style={{
              display: "flex",
              gap: 14,
              marginTop: 46,
              color: "#38401E",
              fontSize: 21,
              fontWeight: 700,
            }}
          >
            <div
              style={{
                display: "flex",
                padding: "13px 18px",
                borderRadius: 999,
                background: "#FFFFFF",
                border: "1px solid #E2E6D6",
              }}
            >
              Locations
            </div>
            <div
              style={{
                display: "flex",
                padding: "13px 18px",
                borderRadius: 999,
                background: "#FFFFFF",
                border: "1px solid #E2E6D6",
              }}
            >
              Experiences
            </div>
            <div
              style={{
                display: "flex",
                padding: "13px 18px",
                borderRadius: 999,
                background: "#FFFFFF",
                border: "1px solid #E2E6D6",
              }}
            >
              Services
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
