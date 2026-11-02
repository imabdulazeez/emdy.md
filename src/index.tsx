import { render } from "@solidjs/web";
import App from "./app";
import { applyDesktopAttribute } from "./lib/desktop/bridge";

applyDesktopAttribute();
render(() => <App />, document.getElementById("app")!);
