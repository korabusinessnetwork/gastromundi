import { useOutletContext } from "react-router-dom";
import PDVView from "@/components/pdv/PDVView";

export default function PDVPage() {
  const { notify } = useOutletContext();
  return <PDVView notify={notify} />;
}
