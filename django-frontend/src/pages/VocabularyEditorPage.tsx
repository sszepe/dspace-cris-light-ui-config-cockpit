import { VocabularyEditor } from "./VocabularyEditor";
import { PageHeader } from "../components/shared";

export function VocabularyEditorPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <PageHeader
        title="Vocabulary Editor"
        desc="Visual tree editor for DSpace controlled vocabulary XML files (oecd.xml, coar-types-v3.xml, etc.). Import existing XMLs, edit the hierarchy, and export back to XML."
      />
      <div style={{ flex: 1, overflow: "auto" }}>
        <VocabularyEditor />
      </div>
    </div>
  );
}
