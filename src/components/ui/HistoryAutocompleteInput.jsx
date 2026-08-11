import { useEffect, useMemo, useRef, useState } from 'react';

export default function HistoryAutocompleteInput({
  value,
  suggestions = [],
  onChange,
  onDraftChange,
  placeholder = '',
}) {
  const inputRef = useRef(null);
  const blurTimerRef = useRef(null);
  const [draft, setDraft] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(value || '');
  }, [value]);

  useEffect(() => () => window.clearTimeout(blurTimerRef.current), []);

  const filteredSuggestions = useMemo(() => {
    const query = String(draft || '').trim().toLocaleLowerCase('ko-KR');
    return suggestions
      .filter((item) => !query || item.toLocaleLowerCase('ko-KR').includes(query))
      .filter((item) => item !== draft)
      .slice(0, 6);
  }, [draft, suggestions]);

  function commit(nextValue) {
    setDraft(nextValue);
    onDraftChange?.(nextValue);
    onChange(nextValue);
  }

  return (
    <div className="history-autocomplete">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          window.clearTimeout(blurTimerRef.current);
          setOpen(true);
        }}
        onBlur={() => {
          blurTimerRef.current = window.setTimeout(() => {
            commit(draft);
            setOpen(false);
          }, 120);
        }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(event) => {
          const nextValue = event.currentTarget.value;
          setComposing(false);
          setDraft(nextValue);
          onDraftChange?.(nextValue);
          setOpen(true);
        }}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraft(nextValue);
          onDraftChange?.(nextValue);
          if (!composing && !event.nativeEvent.isComposing) setOpen(true);
        }}
      />
      {open && filteredSuggestions.length > 0 && (
        <div className="history-autocomplete-list" role="listbox" aria-label="이전에 기록한 식당">
          {filteredSuggestions.map((suggestion) => (
            <button
              type="button"
              role="option"
              aria-selected={suggestion === draft}
              key={suggestion}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                window.clearTimeout(blurTimerRef.current);
                commit(suggestion);
                setOpen(false);
                inputRef.current?.focus();
              }}
            >
              <span>{suggestion}</span>
              <small>이전 기록</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
