import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import Document from "./pages/Document";
import Home from "./pages/Home";
import Login from "./pages/Login";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/doc/:id"
        element={
          <ProtectedRoute>
            <Document />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}