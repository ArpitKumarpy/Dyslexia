import { X, FileText, Trash2 } from 'lucide-react';
import { Document } from '../types';

interface DocumentModalProps {
  documents: Document[];
  onClose: () => void;
  onLoad: (doc: Document) => void;
  onDelete: (id: string) => void;
}

export function DocumentModal({ documents, onClose, onLoad, onDelete }: DocumentModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-xl sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between gap-3 border-b p-4 sm:p-6">
          <h2 className="text-xl font-bold text-gray-800 sm:text-2xl">Saved Documents</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-gray-100"
          >
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {documents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText size={48} className="mx-auto mb-4 opacity-50" />
              <p>No saved documents yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col gap-3 rounded-2xl bg-gray-50 p-4 transition-colors hover:bg-gray-100 sm:flex-row sm:items-center sm:justify-between"
                >
                  <button
                    onClick={() => {
                      onLoad(doc);
                      onClose();
                    }}
                    className="flex-1 text-left"
                  >
                    <h3 className="font-semibold text-gray-800">{doc.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(doc.updated_at).toLocaleDateString()} at{' '}
                      {new Date(doc.updated_at).toLocaleTimeString()}
                    </p>
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                      {doc.content.substring(0, 100)}...
                    </p>
                  </button>
                  <button
                    onClick={() => onDelete(doc.id)}
                    className="self-end rounded p-2 text-red-500 transition-colors hover:bg-red-50 sm:ml-4 sm:self-auto"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
