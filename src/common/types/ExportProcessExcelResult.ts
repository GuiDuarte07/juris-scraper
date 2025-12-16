export interface ExportProcessExcelResult {
  filePath: string;
  filename: string;
  totalProcesses: number;
  processedCount: number;
  batch: {
    id: number;
    system: string;
    state: string;
    date: Date;
  };
}
