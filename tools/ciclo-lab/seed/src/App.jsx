import { BrowserRouter, Routes, Route } from "react-router-dom";
import VendaPage from "@/pages/venda/VendaPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<VendaPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
