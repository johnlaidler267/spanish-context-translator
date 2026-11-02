type PrivateItemCheckboxProps = {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/** Curator-only toggle shared by the upload and edit modals -- see 0030_discover_private_items.sql. */
export function PrivateItemCheckbox({ id, checked, onChange }: PrivateItemCheckboxProps) {
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input"
      />
      <label htmlFor={id} className="text-sm text-foreground">
        <span className="font-medium">Private</span>
        <span className="block text-xs text-muted-foreground">
          Only you can see or read this. Use it for copyrighted texts you want in your own library.
        </span>
      </label>
    </div>
  )
}
