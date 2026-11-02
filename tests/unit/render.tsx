import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { Providers } from "@/components/Providers";

export function renderWithProviders(ui: ReactElement, options: { clock?: () => number } = {}) {
  return render(<Providers clock={options.clock}>{ui}</Providers>);
}
