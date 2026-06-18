"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "@/app/help-center/help-center.module.css";

export default function HelpCenterFaqs({ sidebarTopics, sections, searchQuery = "" }) {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const sectionsWithMatches = useMemo(() => {
    if (!normalizedQuery) {
      return sections;
    }

    return sections
      .map((section) => {
        const matchingItems = section.items.filter((item) => {
          const question = item.question.toLowerCase();
          const answer = item.answer.toLowerCase();
          return question.includes(normalizedQuery) || answer.includes(normalizedQuery);
        });

        if (!matchingItems.length) {
          return null;
        }

        return {
          ...section,
          items: matchingItems,
        };
      })
      .filter(Boolean);
  }, [sections, normalizedQuery]);

  const sectionsToDisplay = normalizedQuery ? sectionsWithMatches : sections;

  const availableSlugs = useMemo(
    () => sectionsToDisplay.map((section) => section.slug),
    [sectionsToDisplay]
  );

  const [activeSlug, setActiveSlug] = useState(() => availableSlugs[0] ?? null);

  useEffect(() => {
    if (!availableSlugs.length) {
      setActiveSlug(null);
      return;
    }

    setActiveSlug((current) => {
      if (current && availableSlugs.includes(current)) {
        return current;
      }
      return availableSlugs[0];
    });
  }, [availableSlugs]);

  const activeSection =
    sectionsToDisplay.find((section) => section.slug === activeSlug) ??
    sectionsToDisplay[0] ??
    null;

  // Do not auto-open any question on first load
  const [activeQuestion, setActiveQuestion] = useState(null);

  useEffect(() => {
    if (!activeSection) {
      setActiveQuestion(null);
      return;
    }

    // Preserve current selection if it still exists; otherwise keep all closed
    setActiveQuestion((current) => (
      current && activeSection.items.some((item) => item.question === current)
        ? current
        : null
    ));
  }, [activeSection]);

  const resultCount = sectionsToDisplay.reduce((total, section) => total + section.items.length, 0);
  const isSearching = Boolean(normalizedQuery);
  const hasResults = resultCount > 0;

  const availableSlugSet = useMemo(() => new Set(availableSlugs), [availableSlugs]);

  return (
    <div className={styles.qna}>
      <aside className={styles.sidebar}>
        <h4 className={styles.sidebarTitle}>Browse Topics</h4>
        <ul className={styles.sidebarList}>
          {sidebarTopics.map((topic) => {
            const topicIsActive = topic.slug === activeSection?.slug;
            const topicHasMatches = availableSlugSet.has(topic.slug);
            const shouldDisable = isSearching && !topicHasMatches;
            const className = [
              styles.sidebarItem,
              topicIsActive ? styles.sidebarItemActive : "",
              shouldDisable ? styles.sidebarItemDisabled : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <li key={topic.slug}>
                <button
                  type="button"
                  className={className}
                  onClick={() => {
                    if (shouldDisable) {
                      return;
                    }
                    setActiveSlug(topic.slug);
                  }}
                  aria-current={topicIsActive ? "true" : undefined}
                  disabled={shouldDisable}
                >
                  <span className={styles.sidebarIcon}>
                    <i className={`fa-solid ${topic.icon}`} aria-hidden="true" />
                  </span>
                  <span>{topic.label}</span>
                  <i className={`fa-solid fa-angle-right ${styles.sidebarArrow}`} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className={styles.qnaContent}>
        <header className={styles.qnaContentHeader}>
          {isSearching ? (
            <>
              <h3>{hasResults ? `Results for "${searchQuery.trim()}"` : "No results found"}</h3>
              <p>
                {hasResults
                  ? `We found ${resultCount} ${resultCount === 1 ? "answer" : "answers"} across ${availableSlugs.length} ${availableSlugs.length === 1 ? "topic" : "topics"}.`
                  : "Try a different keyword or browse the topics on the left."}
              </p>
            </>
          ) : (
            <>
              <h3>{activeSection?.title}</h3>
              <p>{activeSection?.description}</p>
            </>
          )}
        </header>

        {hasResults && activeSection ? (
          <div className={styles.qnaAccordion}>
            {activeSection.items.map((faq) => {
              const isOpen = activeQuestion === faq.question;
              return (
                <details key={faq.question} className={styles.qnaItem} open={isOpen}>
                  <summary
                    onClick={(event) => {
                      event.preventDefault();
                      setActiveQuestion((current) => (current === faq.question ? null : faq.question));
                    }}
                    aria-expanded={isOpen}
                  >
                    <span className={styles.questionMeta}>{activeSection.tag || activeSection.title}</span>
                    <span className={styles.questionText}>{faq.question}</span>
                  </summary>
                  <div className={styles.answer}>
                    <p>{faq.answer}</p>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className={styles.noResults}>
            <p>
              Try searching with another keyword, or select a topic from the menu to keep exploring the help center.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
