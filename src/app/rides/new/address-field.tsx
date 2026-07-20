"use client";

import { useEffect, useRef, useState } from "react";
import { geocodeAddress, type GeocodeHit } from "@/lib/geo/geocode";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

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
  const containerRef = useRef<HTMLDivElement>(null);

  // Render-gating (below) hides stale suggestions; the effect only fetches,
  // so all setState happens in the async callback (react-hooks rule).
  useEffect(() => {
    if (picked || value.trim().length < MIN_QUERY_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const hits = await geocodeAddress(value, {
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
  }, [value, picked]);

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
      <label htmlFor={id} className="text-sm font-medium">
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
        }}
        onFocus={() => setOpen(suggestions.length > 0)}
        placeholder={placeholder}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <input type="hidden" name={`${name}_lat`} value={picked ? String(picked.latitude) : ""} />
      <input type="hidden" name={`${name}_lon`} value={picked ? String(picked.longitude) : ""} />

      {open && !picked && value.trim().length >= MIN_QUERY_LENGTH && suggestions.length > 0 ? (
        <ul className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded border border-gray-300 bg-white shadow-sm">
          {suggestions.map((hit, i) => (
            <li key={`${hit.label}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  setValue(hit.label);
                  setPicked(hit);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
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
