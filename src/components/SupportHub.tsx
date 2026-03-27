import { useState, type ReactNode } from 'react';
import { ExternalLink, Globe, HeartHandshake, MapPinned, Phone, Search, Video } from 'lucide-react';
import { SUPPORT_RESOURCES, SUPPORT_SECTIONS, type SupportResource } from '../data/supportResources';

type FilterKey = 'all' | 'india' | 'global' | 'adult' | 'parent' | 'teacher' | 'student' | 'videos' | 'helplines';

interface SupportHubProps {
  onClose: () => void;
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'india', label: 'India' },
  { key: 'global', label: 'Global' },
  { key: 'adult', label: 'Adults' },
  { key: 'parent', label: 'Parents' },
  { key: 'teacher', label: 'Teachers' },
  { key: 'student', label: 'Students' },
  { key: 'videos', label: 'Videos' },
  { key: 'helplines', label: 'Helplines' },
];

export function SupportHub({ onClose }: SupportHubProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const filteredResources = SUPPORT_RESOURCES.filter((resource) => {
    const searchText = `${resource.title} ${resource.source} ${resource.summary}`.toLowerCase();
    const matchesQuery = searchText.includes(query.trim().toLowerCase());
    if (!matchesQuery) {
      return false;
    }

    switch (activeFilter) {
      case 'all':
        return true;
      case 'india':
      case 'global':
        return resource.region === activeFilter;
      case 'adult':
      case 'parent':
      case 'teacher':
      case 'student':
        return resource.audiences.includes(activeFilter);
      case 'videos':
        return resource.section === 'videos';
      case 'helplines':
        return resource.section === 'helplines';
      default:
        return true;
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex bg-stone-900/50 p-4 backdrop-blur-sm">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-stone-200 bg-stone-50 shadow-2xl">
        <div className="border-b border-stone-200 bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Support Hub
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">Trusted dyslexia support, videos, and help lines</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                This section is powered by a curated, developer-editable list of trusted sources. External links should be reviewed and updated in code whenever needed.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700"
            >
              Close
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-md">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sources, videos, and support..."
                className="w-full rounded-full border border-stone-300 bg-white py-2.5 pl-10 pr-4 text-sm text-stone-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                    activeFilter === filter.key
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <SummaryCard
              icon={<HeartHandshake size={18} />}
              title="Start Here"
              text="Begin with Trusted Guides if you want clear, reassuring explanations before diving into videos or services."
            />
            <SummaryCard
              icon={<Phone size={18} />}
              title="Need Human Support"
              text="Helplines are pinned here for fast access if someone needs emotional support or urgent help."
            />
            <SummaryCard
              icon={<MapPinned size={18} />}
              title="India Included"
              text="Use the India filter to jump to Indian nonprofits, official support programs, and local contact pages."
            />
          </div>

          <div className="space-y-8">
            {SUPPORT_SECTIONS.map((section) => {
              const sectionResources = filteredResources.filter((resource) => resource.section === section.id);
              if (sectionResources.length === 0) {
                return null;
              }

              return (
                <section key={section.id}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 text-stone-600">
                      {getSectionIcon(section.id)}
                    </span>
                    <div>
                      <h3 className="text-xl font-semibold text-stone-900">{section.title}</h3>
                      <p className="text-sm text-stone-600">{section.description}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {sectionResources.map((resource) => (
                      <ResourceCard key={resource.id} resource={resource} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100 text-stone-600">
        {icon}
      </div>
      <h3 className="mt-3 text-base font-semibold text-stone-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-stone-600">{text}</p>
    </div>
  );
}

function ResourceCard({ resource }: { resource: SupportResource }) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{resource.source}</p>
          <h4 className="mt-2 text-lg font-semibold text-stone-900">{resource.title}</h4>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-stone-600">
          {resource.format}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-stone-700">{resource.summary}</p>
      <p className="mt-3 rounded-2xl bg-stone-100 px-3 py-2 text-sm text-stone-700">
        <span className="font-semibold text-stone-900">Why it is trusted:</span> {resource.trustedWhy}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Tag label={resource.region === 'india' ? 'India' : 'Global'} />
        {resource.audiences.map((audience) => (
          <Tag key={audience} label={capitalize(audience)} />
        ))}
        <Tag label={`Checked ${resource.lastChecked}`} />
      </div>

      <a
        href={resource.url}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700"
      >
        Open Resource
        <ExternalLink size={16} />
      </a>
    </article>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
      {label}
    </span>
  );
}

function getSectionIcon(section: SupportResource['section']) {
  switch (section) {
    case 'trusted-guides':
      return <Globe size={18} />;
    case 'videos':
      return <Video size={18} />;
    case 'helplines':
      return <Phone size={18} />;
    case 'find-local-help':
      return <MapPinned size={18} />;
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
