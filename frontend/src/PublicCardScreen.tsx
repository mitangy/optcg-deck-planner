import { CardPage } from "./CardPage";
import { PublicTopbar } from "./PublicTopbar";
import { UpdateNotice } from "./UpdateNotice";

/** `/cards/:cardId` for a visitor who is not signed in: the slim public header around the card page. */
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
