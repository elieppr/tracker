# LifeSync Tracker - Product Requirements Document (PRD) V2

**Version:** 2.0 (Collaborative Revision)  
**Target Platform:** iOS Progressive Web App (PWA)  
**Storage Strategy:** Private, Device-Only (Local Storage)  
**Author:** AI Assistant & User Collaborative Design  

---

## 1. Executive Summary & Project Objectives

The LifeSync Tracker is a lightweight, mobile-optimized Progressive Web App (PWA) designed specifically for iPhone. The application serves as a comprehensive, daily logging tool for individuals looking to uncover personal physiological and psychological correlation trends. By tracking daily energy, emotional valences, physical symptoms, and behavioral variables, LifeSync runs localized algorithms to identify personal trends (e.g., the relationship between caffeine, workout frequency, and energy level crashes).

In order to prioritize total data privacy, the application does not make use of any external databases, servers, or cloud analytics. All tracked data lives locally inside the user's browser, completely under their own control. To support absolute personalization, V2 introduces dynamic customization for all tracking elements (custom emotions, symptoms, and activities), advanced visual graphing, and an interactive calendar interface.

---

## 2. Core Functional Requirements

### 2.1 The Daily Logger (Data Entry Module)

The primary entry screen is optimized for fast, thumb-friendly mobile input. The data structures are defined as follows:

#### A. Date & Time Selection
* **Default State:** Pre-filled with the current system date and time.
* **Manual Adjustment:** A native iOS-style calendar picker to allow retroactive logging for skipped days, fully integrated with the new Calendar View module.

#### B. Split Mood & Emotional State Module
Emotional state is split into two distinct axes to isolate physiological fatigue from cognitive-emotional state:
* **Energy Levels:** An interactive slider from 1 to 10 (1 = complete exhaustion, 10 = hyper-focused/alert).
* **Emotion Tracker:** A multi-select checklist of emotion tags categorized into Positive (+) and Negative (-) valences.

#### C. Custom Descriptor Customization & Category Management (New in V2)
Rather than relying on static, hardcoded lists, LifeSync provides a complete Custom Descriptor Management Suite. Users can customize, delete, and add names to fit their personal vocabulary across all major tracking categories.

| Category | User Customization Rules | Deletion & Data Grace Logic |
| :--- | :--- | :--- |
| **Emotions** | Users can add text labels (e.g., "Peaceful", "Restless") and explicitly assign them to either the Positive (+) or Negative (-) category. | If a custom emotion is deleted, existing historical logs containing that tag will not break. Instead, the deleted specific emotion will dynamically fallback to a generic placeholder "Deleted Positive Emotion" or "Deleted Negative Emotion", preserving the numerical balance of emotional valence for historical analytics. |
| **Symptoms** | Users can define unique somatic or cognitive symptom names (e.g., "Acid Reflux", "Back Pain") to track alongside defaults. | Deleted symptoms map retrospectively to a generic "Custom Symptom (Deleted)" placeholder, ensuring the severity scale and correlation calculations are maintained. |
| **Behaviors / Activities** | Users can input custom behaviors (e.g., "Meditation", "No Sugar Diet") to serve as tracking independent variables. | Deleted activities will map retrospectively to a generic "Custom Activity (Deleted)" placeholder so that historical days still indicate that an activity took place. |

---

### 2.2 Interactive Calendar View Module (New in V2)

To facilitate high-level visual scanning of patterns, LifeSync V2 implements a fully interactive, scrollable Calendar View.

* **Month-at-a-Glance Dashboard:** A standard calendar matrix. Each day block is dynamic and populated with visual indicators representing the data logged for that day.
* **Visual Indicators:**
    * **Energy Indicator:** The background shading or a central numeric indicator on the calendar square corresponds to the logged energy score (e.g., light blue for low energy, deep blue/gold for high energy).
    * **Valence Dots:** Color-coded miniature indicator dots representing positive (green) and negative (red) emotion tallies.
    * **Symptom Icon:** A small warning exclamation mark icon appears if any symptom with a severity rating of "Moderate" or "Severe" was reported.
* **Scrollability & Retroactive Actions:** Smooth vertical scrolling allows users to view past and future months. Tapping on any day tile opens a modal displaying the detailed history for that day, with a quick action button to edit/log data for that specific date.

---

### 2.3 Advanced Analytics & Visualization Graphs (New in V2)

To help users intuitively map complex physiological and psychological trends, the Insights tab will support local interactive graphics built with lightweight HTML5 Canvas or SVG.

1.  **Energy Over Time (Trend Line Chart):**
    * **Description:** A continuous line graph displaying daily Energy Levels (1-10) plotted against time (weekly or monthly filters).
    * **Insight Potential:** Helps identify cyclical energy dips or improvements across a month.
2.  **Behavioral Correlation Grid (Impact Chart):**
    * **Description:** A comparison bar chart showing the difference in average energy or positive valence ratio when a specific behavioral activity is toggled on vs. off (e.g., "Workout" vs. "No Workout").
    * **Insight Potential:** Directly exposes which habits provide the highest return on mood and physical energy.
3.  **Symptom Trigger / Co-occurrence Chart:**
    * **Description:** A horizontal bar chart indicating the percentage of times specific behavior tags or negative emotions co-occurred with a reported physical symptom (e.g., "Headache days saw 80% Caffeine and 70% Stressed").

---

### 2.4 History Log & Timeline Module

Allows chronological scrolling of logs:
* **Card Layout:** Displays date, energy level, selected emotions, symptoms, activities, and notes.
* **Dynamic Custom Tag Updates:** Reflects custom labels. If a label was deleted, it displays the fallback placeholders discussed in the customization table above.
* **Deletions:** Allows instant removal of inaccurate logs.

---

## 3. Technical Specifications & Data Safety

### 3.1 Visual Styling and Mobile UI

* **Layout Rules:** Built with responsive CSS Grid and Flexbox to fit standard iPhone screens flawlessly. Card borders utilize standard iOS rounding (`border-radius: 20px`).
* **Theme Palette:** Light mode optimized. Neutral background (`#f0f2f5`), crisp content cards (`#ffffff`), system blue accents (`#007aff`), system green positive accents (`#34c759`), and red negative indicators (`#ff3b30`).
* **Offline PWA Engine:** Employs manifest-driven standalone parameters and client-side JavaScript execution to run entirely offline without performance loss.

### 3.2 Local Storage Schema & Integrity Backup

To support customizable categories and deletion grace logic, the `localStorage` database schema holds two primary JSON datasets: