import { initApp } from "./js/main.js";

initApp().catch((error) => {
  console.error("Failed to initialize app", error);
});
