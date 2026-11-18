import { MetaPage } from "./MetaPage";
import { PublicTopbar } from "../ui/PublicTopbar";
import { UpdateNotice } from "../app/UpdateNotice";

export function PublicMetaScreen() {
  return (
    <div className="app public-app">
      <UpdateNotice />
      <PublicTopbar />
      <main className="app-main">
        <MetaPage user={null} />
      </main>
    </div>
  );
}
