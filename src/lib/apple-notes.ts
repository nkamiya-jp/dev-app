import { execSync } from "child_process";

export interface AppleNote {
  id: string;
  name: string;
  body: string;
  creationDate: string;
  modificationDate: string;
  folder: string;
}

export function fetchAppleNotes(folder?: string): AppleNote[] {
  const folderFilter = folder
    ? `of folder "${folder}"`
    : "";

  const script = `
    tell application "Notes"
      set noteList to {}
      set allNotes to every note ${folderFilter}
      repeat with n in allNotes
        try
          set noteId to id of n
          set noteName to name of n
          set noteBody to plaintext of n
          set noteCreated to creation date of n as «class isot» as string
          set noteModified to modification date of n as «class isot» as string
          try
            set noteFolder to name of container of n
          on error
            set noteFolder to ""
          end try
          set end of noteList to noteId & "|||" & noteName & "|||" & noteBody & "|||" & noteCreated & "|||" & noteModified & "|||" & noteFolder
        end try
      end repeat
      set AppleScript's text item delimiters to "<<<>>>"
      return noteList as text
    end tell
  `;

  try {
    const result = execSync("osascript -", {
      input: script,
      timeout: 60000,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!result.trim()) return [];

    return result
      .trim()
      .split("<<<>>>")
      .map((entry) => {
        const parts = entry.split("|||");
        return {
          id: parts[0] || "",
          name: parts[1] || "",
          body: parts[2] || "",
          creationDate: parts[3] || "",
          modificationDate: parts[4] || "",
          folder: parts[5] || "",
        };
      })
      .filter((n) => n.id && n.name);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Appleメモの取得に失敗しました";
    throw new Error(message);
  }
}

export function fetchAppleNoteFolders(): string[] {
  const script = `
    tell application "Notes"
      set folderNames to {}
      repeat with f in every folder
        set end of folderNames to name of f
      end repeat
      set AppleScript's text item delimiters to "|||"
      return folderNames as text
    end tell
  `;

  try {
    const result = execSync("osascript -", {
      input: script,
      timeout: 10000,
      encoding: "utf-8",
    });
    if (!result.trim()) return [];
    return result.trim().split("|||");
  } catch {
    return [];
  }
}
