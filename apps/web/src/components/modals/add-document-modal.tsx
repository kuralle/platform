import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kuralle/ui/components/dialog";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { Switch } from "@kuralle/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kuralle/ui/components/tabs";
import { Textarea } from "@kuralle/ui/components/textarea";
import { Upload } from "lucide-react";
import { useState } from "react";

interface AddDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDocumentModal({ open, onOpenChange }: AddDocumentModalProps) {
  const [tab, setTab] = useState<"file" | "url" | "text">("file");
  const [autoSync, setAutoSync] = useState(true);
  const [rag, setRag] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px]">Add document to knowledge base</DialogTitle>
          <DialogDescription>
            Documents are chunked + embedded with your workspace's KB index. RAG calls retrieve them
            during agent inference.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="file">File</TabsTrigger>
            <TabsTrigger value="url">URL</TabsTrigger>
            <TabsTrigger value="text">Paste text</TabsTrigger>
          </TabsList>
          <TabsContent value="file" className="mt-4">
            <Card className="border-dashed bg-soft-hairline/50 p-8 text-center">
              <Upload size={28} className="mx-auto text-mute-slate" />
              <p className="mt-3 text-[13px] text-mute-slate">
                Drag-and-drop or <span className="cursor-pointer underline-offset-2 hover:underline">browse</span>.
                <br />
                PDF, DOCX, TXT, MD up to 25 MB.
              </p>
            </Card>
          </TabsContent>
          <TabsContent value="url" className="mt-4 grid gap-3">
            <Field>
              <FieldLabel htmlFor="url">Source URL</FieldLabel>
              <Input id="url" type="url" placeholder="https://docs.example.com/pricing" />
            </Field>
          </TabsContent>
          <TabsContent value="text" className="mt-4 grid gap-3">
            <Field>
              <FieldLabel htmlFor="text">Paste content</FieldLabel>
              <Textarea id="text" className="min-h-[180px] font-mono text-[12px]" />
            </Field>
          </TabsContent>
        </Tabs>
        <div className="mt-2 grid gap-3">
          <Field>
            <FieldLabel htmlFor="folder">Folder</FieldLabel>
            <Input id="folder" defaultValue="Pricing" />
          </Field>
          <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
            <div>
              <div className="text-[13px] font-medium">Auto-sync</div>
              <div className="text-[12px] text-mute-slate">Re-index automatically when source changes.</div>
            </div>
            <Switch checked={autoSync} onCheckedChange={setAutoSync} />
          </div>
          <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
            <div>
              <div className="text-[13px] font-medium">Include in RAG retrieval</div>
              <div className="text-[12px] text-mute-slate">Agents can reference this document during calls.</div>
            </div>
            <Switch checked={rag} onCheckedChange={setRag} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onOpenChange(false)}>Add document</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
