import { cn } from "~/lib/utils";

export default function Logo(props: { class?: string }) {
  return (
    <svg
      aria-hidden="true"
      data-logo
      viewBox="0 0 24 24"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={cn("shrink-0", props.class)}
    >
      <path
        class="stroke-text"
        d="M3.5 7v10M3.5 10a3 3 0 0 1 6 0v7M9.5 10a3 3 0 0 1 6 0v7"
        stroke-width="2.25"
      />
      <path class="stroke-accent" d="M20.5 4.5v15" stroke-width="2" />
    </svg>
  );
}
