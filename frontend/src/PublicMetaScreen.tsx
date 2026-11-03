import { MetaPage } from "./MetaPage";
import { PublicTopbar } from "./PublicTopbar";
import { UpdateNotice } from "./UpdateNotice";

/** `/meta` for a visitor who is not signed in: the slim public header around the meta browser. */
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
