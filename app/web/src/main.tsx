import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";

import { StrictMode, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { Skeleton } from "./components/ui";
import { AppProvider } from "./state/app";

// Pages are split so the first paint stays light; charts load only on Trends/Overview.
const Overview = lazy(() => import("./pages/Overview"));
const Signals = lazy(() => import("./pages/Signals"));
const Trends = lazy(() => import("./pages/Trends"));
const ItemDetail = lazy(() => import("./pages/ItemDetail"));
const Analyze = lazy(() => import("./pages/Analyze"));
const Review = lazy(() => import("./pages/Review"));
const Safety = lazy(() => import("./pages/Safety"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageFallback() {
  return (
    <div>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-96" />
      <div className="mt-8 grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
    </div>
  );
}

const page = (el: ReactNode) => (
  <ErrorBoundary><Suspense fallback={<PageFallback />}>{el}</Suspense></ErrorBoundary>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={page(<Overview />)} />
              <Route path="signals" element={page(<Signals />)} />
              <Route path="trends" element={page(<Trends />)} />
              <Route path="items/:itemId" element={page(<ItemDetail />)} />
              <Route path="analyze" element={page(<Analyze />)} />
              <Route path="review" element={page(<Review />)} />
              <Route path="safety" element={page(<Safety />)} />
              <Route path="privacy" element={page(<Privacy />)} />
              <Route path="*" element={page(<NotFound />)} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  </StrictMode>,
);
