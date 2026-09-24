"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Languages } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface TranslatableTextValue {
  es?: string | null;
  en?: string | null;
  fr?: string | null;
  it?: string | null;
  de?: string | null;
}

type LangKey = "es" | "en" | "fr" | "it" | "de";

interface TranslatableFieldProps {
  label: string;
  value: TranslatableTextValue | undefined;
  onChange: (next: TranslatableTextValue) => void;
  multiline?: boolean;
  maxLength?: number;
}

const OTHER_LANGS: { key: Exclude<LangKey, "es">; label: string }[] = [
  { key: "en", label: "English" },
  { key: "fr", label: "Français" },
  { key: "it", label: "Italiano" },
  { key: "de", label: "Deutsch" },
];

function renderLangInput(
  id: string,
  currentValue: string,
  multiline: boolean,
  maxLength: number | undefined,
  onInput: (text: string) => void
) {
  if (multiline) {
    return (
      <Textarea
        id={id}
        value={currentValue}
        maxLength={maxLength}
        rows={3}
        onChange={(e) => onInput(e.target.value)}
      />
    );
  }
  return (
    <Input
      id={id}
      type="text"
      value={currentValue}
      maxLength={maxLength}
      onChange={(e) => onInput(e.target.value)}
    />
  );
}

export function TranslatableField({ label, value, onChange, multiline = false, maxLength }: Readonly<TranslatableFieldProps>) {
  const { language } = useLanguage();
  const [showTranslations, setShowTranslations] = useState(false);
  const uid = useId();

  function setLang(lang: LangKey, text: string) {
    onChange({ ...value, [lang]: text });
  }

  const esId = `${uid}-es`;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground" htmlFor={esId}>
        {label}
      </label>
      {renderLangInput(esId, value?.es ?? "", multiline, maxLength, (text) => setLang("es", text))}
      <button
        type="button"
        onClick={() => setShowTranslations((v) => !v)}
        aria-expanded={showTranslations}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary"
      >
        {showTranslations ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Languages className="h-3.5 w-3.5" />
        {t("translationsToggle", language)} ({showTranslations ? t("hideLabel", language) : t("showLabel", language)})
      </button>
      {showTranslations && (
        <div className="grid grid-cols-1 gap-3 border-l-2 border-border pl-4 sm:grid-cols-2">
          {OTHER_LANGS.map(({ key, label: langLabel }) => {
            const fieldId = `${uid}-${key}`;
            return (
              <div key={key}>
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor={fieldId}>
                  {langLabel}
                </label>
                {renderLangInput(fieldId, value?.[key] ?? "", multiline, maxLength, (text) => setLang(key, text))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
