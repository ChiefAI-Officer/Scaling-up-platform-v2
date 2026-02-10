/**
 * Coach Resources Page
 * 
 * Based on: Table of Contents screenshot for additional resources
 * from coach certification process
 * 
 * This page provides certified coaches with access to:
 * - Facilitator Guide
 * - Sample Agendas (Full Day, Virtual)
 * - Slide Decks
 * - Marketing Kit
 * - FAQs
 * - Workbook and Badges Information
 */

import React from 'react';

interface Resource {
    id: string;
    title: string;
    description: string;
    status: 'Published' | 'Draft';
    link?: string;
    type: 'guide' | 'video' | 'deck' | 'marketing' | 'faq' | 'document';
}

const coachResources: Resource[] = [
    {
        id: 'facilitator-guide',
        title: 'Scaling Up to Finish Strong Facilitator Guide',
        description: 'Complete guide for facilitating the Finish Strong workshop including setup, timing, and facilitation tips.',
        status: 'Published',
        type: 'guide',
    },
    {
        id: 'agenda-full-day',
        title: 'Sample Agenda Full Day (In-Person Workshop)',
        description: 'Full day workshop agenda template with timing and activity breakdowns.',
        status: 'Published',
        type: 'document',
    },
    {
        id: 'virtual-samantha',
        title: 'Sample Virtual Workshop with Samantha Doyle',
        description: 'Recording of a virtual workshop session for reference and training.',
        status: 'Published',
        type: 'video',
    },
    {
        id: 'virtual-juletta',
        title: 'Sample Virtual Workshop, Commentary & Suggestions: with Juletta Broomfield',
        description: 'Virtual workshop recording with commentary and facilitation suggestions.',
        status: 'Published',
        type: 'video',
    },
    {
        id: 'deck-full-day',
        title: 'Link to the Full Day Slide Deck',
        description: 'Presentation slides for the full-day in-person workshop.',
        status: 'Published',
        link: 'https://slides.scalingup.com/full-day',
        type: 'deck',
    },
    {
        id: 'deck-virtual',
        title: 'Link to the Virtual Slide Deck',
        description: 'Presentation slides optimized for virtual workshop delivery.',
        status: 'Published',
        link: 'https://slides.scalingup.com/virtual',
        type: 'deck',
    },
    {
        id: 'marketing-kit',
        title: 'Promo Marketing Kit',
        description: 'Marketing materials, graphics, and templates for promoting your workshops.',
        status: 'Published',
        type: 'marketing',
    },
    {
        id: 'register-workshop',
        title: 'Link to Register for a New Workshop',
        description: 'Submit a new workshop request through the coach portal.',
        status: 'Published',
        link: '/coach/workshops/new',
        type: 'guide',
    },
    {
        id: 'faqs',
        title: 'FAQs',
        description: 'Frequently asked questions about workshop delivery and administration.',
        status: 'Draft',
        type: 'faq',
    },
    {
        id: 'workbook-badges',
        title: 'Workbook and Badges Information - In Person Workshops',
        description: 'Information about participant workbooks and certification badges for in-person workshops.',
        status: 'Published',
        type: 'document',
    },
];

const getTypeIcon = (type: Resource['type']) => {
    switch (type) {
        case 'guide': return '📚';
        case 'video': return '🎥';
        case 'deck': return '📊';
        case 'marketing': return '🎨';
        case 'faq': return '❓';
        case 'document': return '📄';
        default: return '📁';
    }
};

export function CoachResourcesPage() {
    const publishedResources = coachResources.filter(r => r.status === 'Published');
    const draftResources = coachResources.filter(r => r.status === 'Draft');

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-gradient-to-r from-purple-800 to-blue-600 text-white py-12 px-6">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-3xl font-bold mb-2">Coach Resources</h1>
                    <p className="text-lg opacity-90">
                        Access guides, templates, and materials for delivering Scaling Up workshops
                    </p>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto py-10 px-6">
                {/* Additional Resources Section */}
                <section className="mb-10">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-gray-800">
                            📚 Additional Resources
                        </h2>
                        <span className="text-sm text-gray-500">
                            {publishedResources.length} available resources
                        </span>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                        {publishedResources.map((resource, index) => (
                            <div
                                key={resource.id}
                                className={`flex items-center justify-between p-4 hover:bg-gray-50 transition-colors ${index !== publishedResources.length - 1 ? 'border-b border-gray-100' : ''
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    <span className="text-2xl">{getTypeIcon(resource.type)}</span>
                                    <div>
                                        <h3 className="font-medium text-gray-900">
                                            {resource.link ? (
                                                <a
                                                    href={resource.link}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    {resource.title}
                                                </a>
                                            ) : (
                                                resource.title
                                            )}
                                        </h3>
                                        <p className="text-sm text-gray-500">{resource.description}</p>
                                    </div>
                                </div>
                                <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                                    {resource.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Draft Resources */}
                {draftResources.length > 0 && (
                    <section className="mb-10">
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">
                            🚧 Coming Soon
                        </h2>
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden opacity-75">
                            {draftResources.map((resource) => (
                                <div
                                    key={resource.id}
                                    className="flex items-center justify-between p-4"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-2xl">{getTypeIcon(resource.type)}</span>
                                        <div>
                                            <h3 className="font-medium text-gray-600">{resource.title}</h3>
                                            <p className="text-sm text-gray-400">{resource.description}</p>
                                        </div>
                                    </div>
                                    <span className="px-3 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
                                        Draft
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Quick Actions */}
                <section className="bg-gradient-to-r from-purple-700 to-blue-600 rounded-lg p-6 text-white">
                    <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <a
                            href="/coach/workshops/new"
                            className="block bg-white/20 hover:bg-white/30 rounded-lg p-4 transition-colors"
                        >
                            <span className="text-2xl mb-2 block">📝</span>
                            <h3 className="font-medium">Request New Workshop</h3>
                            <p className="text-sm opacity-80">Submit a new workshop for approval</p>
                        </a>
                        <a
                            href="/coach/dashboard"
                            className="block bg-white/20 hover:bg-white/30 rounded-lg p-4 transition-colors"
                        >
                            <span className="text-2xl mb-2 block">📊</span>
                            <h3 className="font-medium">View Dashboard</h3>
                            <p className="text-sm opacity-80">Check your workshops and registrations</p>
                        </a>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default CoachResourcesPage;
