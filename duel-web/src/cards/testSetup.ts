import { setCardData } from "./cardData";
import { cardData } from "./cardDataSource";

// App code gets the card data from `loadCardData()` (a separate chunk in the browser). Unit tests read it
// synchronously, so they install it up front.
setCardData(cardData);
