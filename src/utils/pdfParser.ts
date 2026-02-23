import * as pdfjsLib from "pdfjs-dist"
import pdfWorker from "pdfjs-dist/build/pdf.worker?url"

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

    let fullText = ""

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()

      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ")

      fullText += pageText + "\n\n"
    }

    return fullText
  } catch (error) {
    console.error("Error parsing PDF:", error)
    throw new Error("Failed to parse PDF. Please try another file.")
  }
}