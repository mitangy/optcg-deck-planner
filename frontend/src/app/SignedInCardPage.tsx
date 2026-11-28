import { CardPage } from "../cards/CardPage";
import { renderCardPageActions } from "../pages/shopping/lightboxActions";

export default function SignedInCardPage() {
  return <CardPage renderActions={renderCardPageActions} />;
}
