import { CardPage } from "./CardPage";
import { PublicTopbar } from "../ui/PublicTopbar";
import { UpdateNotice } from "../app/UpdateNotice";

export function PublicCardScreen() {
  return (
    <div className="app public-app">
      <UpdateNotice />
      <PublicTopbar />
      <main className="app-main">
        <CardPage />
      </main>
    </div>
  );
}
