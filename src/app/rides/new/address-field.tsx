"use client";

import { useEffect, useRef, useState } from "react";
import { geocodeAddress, type GeocodeHit } from "@/lib/geo/geocode";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

/**
 * Suggestion requests go browser→Photon directly, so there's no server-side
 * IP to geolocate — the browser timezone is the best available signal for
 * "this user is in Sweden". Swedish users get results filtered to a Sweden
 * bounding box and ranked from Stockholm; everyone else stays unbiased.
 */
const SWEDEN = {
  bbox: [10.0, 55.0, 24.5, 69.5],
  bias: { lat: 59.33, lon: 18.07 },
} as const;

function regionOptions() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/Stockholm" ? SWEDEN : {};
  } catch {
    return {};
  }
}

/**
 * Address input with Photon-backed suggestions. Picking a suggestion pins its
 * coordinates into hidden `<name>_lat`/`<name>_lon` inputs; editing the text
 * afterwards clears them, and the server action falls back to geocoding the
 * raw text so free-typed addresses still work.
 */
export function AddressField({
  id,
  name,
  label,
  placeholder,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [picked, setPicked] = useState<GeocodeHit | null>(null);
  const [suggestions, setSuggestions] = useState<GeocodeHit[]>([]);
  const [open, setOpen] = useState(false);
  // A prefilled address is already the answer. Without this, opening the edit
  // sheet immediately geocoded both saved addresses and dropped a suggestion
  // list under each one — the address appearing to render twice.
  const [edited, setEdited] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Render-gating (below) hides stale suggestions; the effect only fetches,
  // so all setState happens in the async callback (react-hooks rule).
  useEffect(() => {
    if (!edited || picked || value.trim().length < MIN_QUERY_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const hits = await geocodeAddress(value, {
          ...regionOptions(),
          fetchImpl: (input, init) => fetch(input, { ...init, signal: controller.signal }),
        });
        if (!controller.signal.aborted) {
          setSuggestions(hits);
          setOpen(hits.length > 0);
        }
      } catch {
        // Network hiccups just mean no suggestions; typing on retries.
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [value, picked, edited]);

  // Close the dropdown when tapping/clicking outside the field.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-[0.95rem] font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        required
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setPicked(null);
          setEdited(true);
        }}
        onFocus={() => setOpen(edited && suggestions.length > 0)}
        placeholder={placeholder}
        className="h-11 rounded-lg border border-input bg-card px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      />
      <input type="hidden" name={`${name}_lat`} value={picked ? String(picked.latitude) : ""} />
      <input type="hidden" name={`${name}_lon`} value={picked ? String(picked.longitude) : ""} />

      {open && !picked && value.trim().length >= MIN_QUERY_LENGTH && suggestions.length > 0 ? (
        <ul className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-sm">
          {suggestions.map((hit, i) => (
            <li key={`${hit.label}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  setValue(hit.label);
                  setPicked(hit);
                  setOpen(false);
                }}
                className="w-full px-3 py-3 text-left text-[0.95rem] hover:bg-secondary active:bg-secondary"
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
