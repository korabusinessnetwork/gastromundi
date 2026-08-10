import { useOutletContext } from "react-router-dom";
import DeliveryView from "@/components/delivery/DeliveryView";

export default function DeliveryPage() {
  const { notify } = useOutletContext();
  return <DeliveryView notify={notify} />;
}
