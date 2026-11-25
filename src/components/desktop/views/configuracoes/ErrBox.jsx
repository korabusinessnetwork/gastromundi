import { LuTriangleAlert } from "react-icons/lu";

export default function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="cfg__erro-box">
      <LuTriangleAlert size={15} className="cfg__erro-box-icone" aria-hidden="true" /> {msg}
    </div>
  );
}
