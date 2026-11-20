import { Route, Routes } from "react-router-dom";
import { ThemeToggle } from "./lib/theme";

function Placeholder() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <ThemeToggle />
      <h1 className="text-3xl font-bold">BookFlow AI</h1>
      <p className="text-muted-foreground">Reservas 24/7 por WhatsApp con IA.</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Placeholder />} />
    </Routes>
  );
}
