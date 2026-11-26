import { useOutletContext } from "react-router-dom";
import PDVView from "@/features/pdv/desktop";

export default function PDVPage() {
  const { notify } = useOutletContext();
  return <PDVView notify={notify} />;
}
