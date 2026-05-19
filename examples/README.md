# Example wiring

```js
// app.js
import { configure } from "@dwp/govuk-casa";
import casaDevOverlay from "casa-dev-overlay";

import pages from "./definitions/pages.js";
import planFactory from "./definitions/plan.js";

const { mount } = configure({
  views: ["./views"],
  session: { secret: "dev", name: "sid", ttl: 3600, secure: false },
  i18n: { dirs: ["./locales"], locales: ["en"] },
  pages: pages(),
  plan: planFactory(),
  plugins: [
    casaDevOverlay({
      presetsDir: "./.casa-presets",
    }),
  ],
});
```

Drop [`example-preset.yaml`](./example-preset.yaml) into `./.casa-presets/partner.yaml`, start the app, click the **CASA** badge in the top-right, switch to the **Presets** tab and hit **Apply**.
