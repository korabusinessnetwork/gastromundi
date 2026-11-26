import { useOutletContext } from "react-router-dom";
import DeliveryView from "@/features/delivery/desktop/DeliveryView";

export default function DeliveryPage() {
  const { notify } = useOutletContext();
  return <DeliveryView notify={notify} />;
}
