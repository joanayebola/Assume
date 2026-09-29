import { Plus } from "lucide-react";

import { Container } from "@/components/ui/container";
import { faqs } from "@/content/landing";
import { products } from "@/lib/billing/config";
import { formatPrice } from "@/lib/billing/format";

import { SectionHeading } from "./section-heading";

/** Native <details> accordion: keyboard + screen-reader friendly with zero JS. */
function pricingAnswer() {
  const price = formatPrice(products().routine.price);
  return `Creating an account and answering the questions is free. Your personalised routine is a one-time purchase${
    price ? ` of ${price}` : ""
  } — no subscription. Adjusting and editing it afterwards is included.`;
}

export function Faq() {
  const items = [faqs[0], { q: "What does it cost?", a: pricingAnswer() }, ...faqs.slice(1)];
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="scroll-mt-20 border-t-2 border-ink py-section lg:py-section-lg"
    >
      <Container size="wide" className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <SectionHeading id="faq-title" eyebrow="FAQ" title="Good questions." />

        <div className="border-t-2 border-ink">
          {items.map((item) => (
            <details key={item.q} className="group border-b-2 border-ink">
              <summary className="flex cursor-pointer items-center justify-between gap-6 py-6 text-left text-lg font-semibold leading-snug tracking-tight">
                {item.q}
                <Plus
                  aria-hidden
                  strokeWidth={2.5}
                  className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-45"
                />
              </summary>
              <p className="max-w-xl pb-7 leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
