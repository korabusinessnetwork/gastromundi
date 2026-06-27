import C from "@/constants/colors";

export default function KLogo({ size = 28 }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: size * 0.28,
      background: C.accent, color: "#fff",
      fontWeight: 900, fontSize: size * 0.56,
      display: "flex", alignItems: "center", justifyContent: "center",
      letterSpacing: "-1px", flexShrink: 0,
    }}>
      K
    </div>
  );
}
