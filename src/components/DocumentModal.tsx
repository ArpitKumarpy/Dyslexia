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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">Saved Documents</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
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
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
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
                    className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded transition-colors"
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
