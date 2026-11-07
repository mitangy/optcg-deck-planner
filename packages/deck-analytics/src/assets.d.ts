// Vite's `?url` import suffix (the apps' bundlers resolve it; tsc only needs the shape).
declare module "*?url" {
  const url: string;
  export default url;
}
