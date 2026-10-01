// Tests render board components to markup (through react-native-web); the app itself never imports this.
declare module "react-dom/server" {
  export function renderToStaticMarkup(element: import("react").ReactElement): string;
}
