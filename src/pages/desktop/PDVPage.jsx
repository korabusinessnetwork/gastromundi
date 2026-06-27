import { useOutletContext } from "react-router-dom";
import PDVView from "@/components/desktop/views/PDVView";

export default function PDVPage() {
  const { notify } = useOutletContext();
  return <PDVView notify={notify} />;
}
