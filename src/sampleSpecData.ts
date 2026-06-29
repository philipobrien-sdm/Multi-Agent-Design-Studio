/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpecObject, SpecCompilerOutput } from "./types";

export interface SampleSpecification {
  id: string;
  name: string;
  description: string;
  idea: string;
  spec: SpecObject;
  compiledFiles: SpecCompilerOutput[];
}

export const sampleSpecifications: SampleSpecification[] = [
  {
    id: "calorie_quest",
    name: "CalorieQuest: Gamified Fitness RPG",
    description: "An RPG calorie planner recommending meals based on mood, weather, and calories, featuring stat level-ups and interactive quests.",
    idea: "A gamified fitness and nutrition application called CalorieQuest. Users log food intake to earn experience points (XP) for their virtual RPG hero. The application integrates with a local weather API and a mood check-in widget to recommend daily food choices (e.g., warm protein stews on rainy days, refreshing salads on hot days). Includes detailed algorithmic leveling calculations, LLM-powered prompt recipe pairing, and strict C4 layout specs.",
    spec: {
      idea: "A gamified fitness and nutrition application called CalorieQuest. Users log food intake to earn experience points (XP) for their virtual RPG hero. The application integrates with a local weather API and a mood check-in widget to recommend daily food choices (e.g., warm protein stews on rainy days, refreshing salads on hot days). Includes detailed algorithmic leveling calculations, LLM-powered prompt recipe pairing, and strict C4 layout specs.",
      version: 6,
      modules: [
        {
          name: "RPG Character & Leveling Engine",
          description: "Tracks character levels, manages stat distributions (Strength, Stamina, Vitality), processes incoming calorie points, and administers leveling-up logic when calorie intake compliance milestones are satisfied.",
          boundaries: [
            "Provides HTTP endpoints for fetching character sheets.",
            "Consumes daily calorie ledger compliance data to award experience points.",
            "Integrates with the Database persistent layer to update character stats."
          ],
          dataFlow: [
            "Food Ledger writes daily summary to Database.",
            "Leveling Engine polls Database hourly for compliant days.",
            "Experience multiplier triggered; returns new Level status to Client."
          ]
        },
        {
          name: "Weather & Mood recommendation Router",
          description: "Polls local micro-weather forecasts and self-reported mood vectors to route tailored nutrition tags (such as Comfort, refreshing, Energizing) into the recipe generation controller.",
          boundaries: [
            "Communicates with OpenWeatherMap external API.",
            "Maintains local lookup tables for mood-food comfort pairings.",
            "Feeds target recipe constraints to LLM generation service."
          ],
          dataFlow: [
            "Client uploads mood rating (1-10) and geolocation.",
            "Router resolves ambient temperature and correlates comfort recipes.",
            "Outputs customized JSON tags list to the prompt execution context."
          ]
        },
        {
          name: "Caloric Ledger & Nutrition Tracker",
          description: "Maintains high-granularity dietary records. Logs macro nutrients (protein, fat, carbs) and compares logs against a dynamically calculated active metabolic rate (AMR) budget.",
          boundaries: [
            "Validates meal portion sizes.",
            "Provides secure endpoints for batch food additions.",
            "Enforces strict privacy limits on personal health telemetry."
          ],
          dataFlow: [
            "User submits meal intake log payload.",
            "Tracker processes calorie totals and updates macro-ratio progress metrics.",
            "Triggers real-time alerts if critical nutritional deficits occur."
          ]
        }
      ],
      ux_flows: [
        {
          screenName: "RPG Hero Dashboard",
          journey: "Logged-in user views current level progress and daily calorie quests.",
          uiState: "Main column holds a 3D avatar element and level meter. Right side has a beautiful calorie wheel showing consumed vs remaining target calories. Bottom section displays three 'Daily Quests' (e.g. 'Eat 80g Protein', 'Stay under 2000 kcal').",
          transitions: [
            "Click Avatar -> Navigate to Character sheet details screen",
            "Click Log Food Button -> Opens sliding overlay drawer",
            "Click Recommendations -> Transitions to Weather & Mood food finder"
          ]
        },
        {
          screenName: "Mood Dial & Nutrition Finder",
          journey: "User feels uninspired, sets mood dial, and receives climate-paired meal recommendations.",
          uiState: "A floating dial (1-10 slider representing sadness to joy) centered on a warm-colored glassmorphic card. Top corner displays a weather widget showing local temperature ('62°F, Light Rain'). Below, three recommendation cards slide in.",
          transitions: [
            "Slide Mood Dial -> Recalculate recommendations immediately",
            "Click Recipe -> Open immersive fullscreen Recipe details modal",
            "Click Log Recommendation -> Add meal to active Caloric Ledger"
          ]
        }
      ],
      algorithms: [
        {
          name: "Calorie Compliance RPG Experience (XP) Loop",
          description: "Calculates the dynamic XP reward for daily calorie budget compliance, factoring in streak multipliers and macronutrient balances to promote long-term engagement.",
          pseudocode: "function calculateDailyXP(targetCalories, actualCalories, proteinTarget, actualProtein, streakCount):\n  calorieDeficit = abs(targetCalories - actualCalories)\n  complianceRatio = max(0, 1 - (calorieDeficit / targetCalories))\n  \n  if complianceRatio >= 0.90:\n    baseXP = 100\n  else if complianceRatio >= 0.80:\n    baseXP = 50\n  else:\n    baseXP = 10\n    \n  proteinCompliance = actualProtein >= proteinTarget ? 1.25 : 1.0\n  streakMultiplier = 1.0 + (min(streakCount, 30) * 0.05)\n  \n  finalXP = baseXP * proteinCompliance * streakMultiplier\n  \n  return Math.round(finalXP)",
          complexity: "O(1) Constant Time"
        },
        {
          name: "Weather-Mood Synergy Recipe Selector",
          description: "Maps a combined weather Comfort Index and a numerical mood rating to categorize target meal recommendations using weighted rating criteria.",
          pseudocode: "function resolveMealArchetype(temperatureCelsius, weatherCondition, moodValue):\n  // temperature range: -10 to 45\n  // moodValue range: 1 to 10\n  \n  comfortScore = 5.0\n  if temperatureCelsius < 15:\n    comfortScore += 2.0 // Needs warming, hearty meals\n  else if temperatureCelsius > 30:\n    comfortScore -= 2.0 // Needs cool, refreshing dishes\n    \n  if moodValue < 4:\n    comfortScore += 1.5 // Comfort food high priority\n    \n  if comfortScore >= 7.0:\n    return 'Hearty Comfort' // Stews, rich soups, roasted proteins\n  else if comfortScore <= 4.0:\n    return 'Fresh & Hydrating' // Salads, chilled bowls, wraps\n  else:\n    return 'Balanced Fuel' // Grains, dynamic bowls, light sautés",
          complexity: "O(K) where K is lookup taxonomy size"
        }
      ],
      prompts: [
        {
          featureName: "Climate-Mood Recipe Synthesizer",
          template: "You are the Chef RPG AI. Your job is to generate a recipe based on user criteria.\n\nContext Input:\n- Target Meal Type: {{meal_type}}\n- Weather Condition: {{weather_temp_f}}°F, {{weather_desc}}\n- User Mood Vector: {{mood_scale_1_to_10}}/10\n- Calorie Budget: {{target_calories}} kcal\n\nInstructions:\n1. Tailor the texture and temperature of the recommendation. Cold/rainy days MUST use hot, comforting foods. Hot, humid days MUST use chilled, refreshing foods.\n2. Adjust spice levels based on mood (milder, soothing spices for low mood; refreshing, vibrant flavors for high mood).\n3. Keep the recipe under the Calorie Budget by utilizing lean proteins and dense vegetables.\n\nOutput MUST strictly be in JSON format:\n{\n  \"recipeName\": \"...\",\n  \"calories\": 0,\n  \"prepTime\": \"...\",\n  \"ingredients\": [\"...\"],\n  \"instructions\": [\"...\"]\n}",
          inputs: ["meal_type", "weather_temp_f", "weather_desc", "mood_scale_1_to_10", "target_calories"],
          outputs: ["recipeName", "calories", "prepTime", "ingredients", "instructions"],
          guardrails: [
            "Check that output calories do not exceed the user's remaining caloric budget.",
            "Verify all ingredient suggestions are safe culinary combinations.",
            "Sanitize input text against markdown and token-injection prompts."
          ]
        },
        {
          featureName: "Dietary Safety Audit Gatekeeper",
          template: "You are a professional dietitian safety auditor. Read the user's calorie logs.\n\nInput:\n- Consumed Calories: {{consumed_calories}}\n- Daily Recommended Minimum: {{recommended_minimum}}\n\nTask:\nIdentify if the user is keeping their calorie intake dangerously low (under 1200 kcal for extended periods) or practicing extreme starvation.\n\nResponse format:\n{\n  \"isUnsafe\": true/false,\n  \"severity\": \"none\"/\"warning\"/\"critical\",\n  \"adviceText\": \"A supportive, friendly message advising proper nutrition instead of extreme deficits.\"\n}",
          inputs: ["consumed_calories", "recommended_minimum"],
          outputs: ["isUnsafe", "severity", "adviceText"],
          guardrails: [
            "Never offer clinical medical diagnoses.",
            "Ensure advice is empathetic, positive, and emphasizes leveling up character stats through healthy fueling.",
            "Flag critical triggers for prompt medical referral."
          ]
        }
      ],
      risks: [
        {
          agentName: "Algorithm Auditor",
          riskType: "algorithm",
          severity: "medium",
          description: "High api polling frequency on micro-weather data could lead to rate-limit lockouts or delayed recommendation loads.",
          recommendation: "Implement Redis-backed local caching for weather reports based on geolocation grids. Cache weather forecasts for up to 30 minutes."
        },
        {
          agentName: "Alignment Officer",
          riskType: "safety",
          severity: "high",
          description: "Users might log extremely low calorie inputs to try to accelerate their RPG leveling speed, leading to unsafe eating patterns.",
          recommendation: "Hard-code an experience points cap. Do not award extra level XP for staying significantly under 85% of the daily calorie target."
        },
        {
          agentName: "System Architect",
          riskType: "architecture",
          severity: "low",
          description: "Database locks could occur if leveling calculations run synchronously inside the meal intake logging API transaction.",
          recommendation: "Process experience point tallies and level increases asynchronously using a background queue workers pattern."
        }
      ],
      open_questions: [
        "Should we support third-party wearable devices (e.g. Fitbit, Apple Watch) for dynamic active metabolic rate (AMR) adjustments?",
        "Can characters team up for multiplayer boss battles where victory requires meeting group macro quotas?"
      ],
      final_spec: "# CalorieQuest Product Design Specification\n\n## 1. System Overview\nCalorieQuest is a comprehensive, gamified fitness, nutrition, and lifestyle RPG that turns boring caloric calculation into an interactive questing adventure. By integrating micro-climate details and self-reported emotional trackers, it delivers uniquely custom recommendations that are both biologically and psychologically sound.\n\n## 2. Core Service Architecture\n- **Client Portal**: A mobile-first, high-performance React application.\n- **RPG Core API**: Node.js microservice handling levelling engines, database saves, and quests.\n- **Recommendation Engine**: Intelligent LLM integration module proxying and refining prompts to Google Gemini API servers.\n- **Data Tier**: PostgreSQL instance storing transaction logs, character profiles, and local caches.\n\n## 3. Key Algorithmic Leveling\nTo maintain engagement, the leveling engine scales experience point awards. Compliance streaking offers cumulative multipliers, while hazardous low-intake periods are gated via safety auditors.\n\n## 4. Safety & Compliance Guardrails\nSafety is a primary architectural mandate. The system uses real-time prompt-based classification checks to scan logs for warning signs of extreme calorie deficits or starvation loops.",
      design_elements: [
        {
          id: "c4_map_01",
          agent: "architect",
          type: "c4_diagram",
          title: "CalorieQuest System Architecture Mapping",
          description: "Shows container boundaries, technologies, and interface routes mapping the React Client, Express RPG Service, PostgreSQL store, and Gemini API proxy.",
          content: "[Web Client React 19] --(REST/JSON)--> [Express Application Controller (Node.js)]\n[Express Application Controller] --(Drizzle ORM)--> [PostgreSQL Instance]\n[Express Application Controller] --(HTTPS)--> [Google Gemini Pro AI Model]\n[Express Application Controller] --(Redis Client)--> [In-Memory Cache (Weather Logs)]"
        },
        {
          id: "api_contract_01",
          agent: "architect",
          type: "api_contract",
          title: "CalorieQuest Character & Recommendation Routes",
          description: "Formal specification of REST routes for fetching RPG characters, submitting calorie updates, and fetching mood suggestions.",
          content: "GET /api/v1/character\nPOST /api/v1/meals/log\nGET /api/v1/meals/recommendations",
          structured_data: {
            endpoints: [
              {
                method: "GET",
                path: "/api/v1/character",
                description: "Retrieves the active user's RPG avatar statistics, level, experience points, and equipment inventory.",
                parameters: [
                  { name: "Authorization", type: "string", required: true, desc: "Bearer token credentials JWT" }
                ],
                response_sample: {
                  success: true,
                  character: {
                    level: 8,
                    experience: 7420,
                    xpToNextLevel: 10000,
                    class: "Paladin of Protein",
                    stats: { strength: 18, stamina: 14, vitality: 15 }
                  }
                }
              },
              {
                method: "POST",
                path: "/api/v1/meals/log",
                description: "Logs a food item to the ledger. Instantly calculates calories, macros, updates RPG character experience, and audits for safety.",
                parameters: [
                  { name: "foodName", type: "string", required: true, desc: "Name of food consumed" },
                  { name: "calories", type: "number", required: true, desc: "Total calories in kcal" },
                  { name: "proteinGrams", type: "number", required: true, desc: "Protein macro in grams" }
                ],
                response_sample: {
                  success: true,
                  loggedItem: { id: "log_8321", foodName: "Grilled Chicken Breast", calories: 165 },
                  xpEarned: 45,
                  levelUpOccurred: false
                }
              },
              {
                method: "GET",
                path: "/api/v1/meals/recommendations",
                description: "Fetches weather and mood paired meals dynamically compiled using prompt frameworks.",
                parameters: [
                  { name: "moodScale", type: "number", required: true, desc: "Self reported mood from 1 (sad) to 10 (happy)" },
                  { name: "latitude", type: "number", required: false, desc: "GPS Latitude for localized weather query" },
                  { name: "longitude", type: "number", required: false, desc: "GPS Longitude for localized weather query" }
                ],
                response_sample: {
                  weather: { tempF: 48, condition: "Overcast Drizzle" },
                  moodTag: "Hearty Comfort Food",
                  recipeRecommendations: [
                    { recipeName: "Spiced Lentil & Turkey Soup", calories: 340, prepTime: "25 min" }
                  ]
                }
              }
            ]
          }
        },
        {
          id: "bdd_spec_01",
          agent: "ux_designer",
          type: "behavioural_spec",
          title: "Gherkin Storyboard: Level-Up Celebration Journey",
          description: "Validates UI behavior and celebratory animations when a user logs a meal that triggers character level progression.",
          content: "Given the user is on the RPG Hero Dashboard with 9,980 out of 10,000 XP\nWhen the user logs a meal worth 50 XP\nThen the character experience should update to 30 XP\nAnd the level count should increment from 8 to 9\nAnd an immersive fullscreen level-up particle animation should trigger\nAnd a modal displaying unlocked character skills should open on screen"
        },
        {
          id: "seq_diag_01",
          agent: "algorithm_designer",
          type: "mermaid_sequence",
          title: "Weather-Mood recommendation flow sequence",
          description: "Sequence model showcasing the multi-service calls when a user triggers a recommendation search query.",
          content: "sequenceDiagram\n  autonumber\n  Client->>Express Server: GET /meals/recommendations?moodScale=3\n  Express Server->>Weather API: Query local conditions by IP\n  Weather API-->>Express Server: Return light rain, 48F\n  Express Server->>Gemini API: Submit synthesized prompt template\n  Gemini API-->>Express Server: Return recipe JSON (Spiced Lentil Soup)\n  Express Server-->>Client: Return complete suggestions dashboard view"
        }
      ]
    },
    compiledFiles: [
      {
        language: "typescript",
        filename: "prisma.schema",
        content: `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  characterName String
  level         Int       @default(1)
  experience    Int       @default(0)
  createdAt     DateTime  @default(now())
  foodLogs      FoodLog[]
}

model FoodLog {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  foodName     String
  calories     Int
  proteinGrams Int
  loggedAt     DateTime @default(now())
}`
      },
      {
        language: "typescript",
        filename: "CalorieRPGController.ts",
        content: `import { Request, Response } from 'express';

export async function logMealAndAwardXP(req: Request, res: Response) {
  const { userId, foodName, calories, proteinGrams } = req.body;
  
  try {
    // 1. Log the food entry
    const foodEntry = { id: "log_" + Math.random(), foodName, calories, proteinGrams, loggedAt: new Date() };
    
    // 2. Base XP Reward
    let xpEarned = 50;
    if (calories < 500 && proteinGrams > 20) {
      xpEarned += 25; // Protein efficiency bonus!
    }
    
    // 3. Increment character levels
    let didLevelUp = false;
    let newLevel = 8;
    let currentXp = 7420 + xpEarned;
    
    if (currentXp >= 10000) {
      currentXp -= 10000;
      newLevel += 1;
      didLevelUp = true;
    }
    
    return res.status(200).json({
      success: true,
      loggedItem: foodEntry,
      xpEarned,
      newExperience: currentXp,
      newLevel,
      didLevelUp,
      statusMessage: didLevelUp ? "Level Up! You are now level " + newLevel : "XP Added!"
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Internal transaction failure" });
  }
}`
      }
    ]
  },
  {
    id: "aero_sync",
    name: "AeroSync: Autonomous Delivery Scheduler",
    description: "An autonomous drone dispatch platform coordinating delivery path algorithms based on payloads, safety zones, and weather restrictions.",
    idea: "A real-time delivery routing and autonomous dispatch suite called AeroSync. Tracks payload dimensions, battery health, air traffic zones, and wind speeds to automatically optimize the drone path to avoid safe city limits. Features custom A* search algorithm visualization, strict Gherkin behavioral checks, and C4 mapping models.",
    spec: {
      idea: "A real-time delivery routing and autonomous dispatch suite called AeroSync. Tracks payload dimensions, battery health, air traffic zones, and wind speeds to automatically optimize the drone path to avoid safe city limits. Features custom A* search algorithm visualization, strict Gherkin behavioral checks, and C4 mapping models.",
      version: 5,
      modules: [
        {
          name: "Drone Telemetry & Coordination Hub",
          description: "Maintains persistent websocket feeds with active drones, checking battery state, geographic coordinates, flight speeds, and sensor payloads.",
          boundaries: [
            "Accepts high-frequency drone keepalives.",
            "Exposes websocket endpoints for real-time tracking dashboards.",
            "Triggers emergency recall events if battery drops below 15%."
          ],
          dataFlow: [
            "Drone streams GPS and battery state.",
            "Coordination Hub evaluates safety envelopes.",
            "Updates the central geospatial database."
          ]
        },
        {
          name: "Flight Path Calculator Engine",
          description: "Processes grid data, local wind factors, and air-exclusion vectors to generate dynamic flight pathways.",
          boundaries: [
            "Queries national geo-exclusion boundary tables.",
            "Computes vector resistance against winds.",
            "Submits route manifests to ground control."
          ],
          dataFlow: [
            "Route Request includes origin, weight, and destination.",
            "Engine maps obstacles and wind resistance vectors.",
            "Output contains node list flight path."
          ]
        }
      ],
      ux_flows: [
        {
          screenName: "Geospatial Flight Monitor",
          journey: "Ground controller views current active flights and battery indicators.",
          uiState: "Immersive map taking up 80% of screen. Sidebar lists active drone serial codes. Clicking a drone shows its battery indicator gauge and estimated time of arrival (ETA). Red zones draw exclusion zones dynamically on map.",
          transitions: [
            "Click Red Zone -> Show city safety bylaws modal",
            "Click Dispatch New -> Open mission builder wizard"
          ]
        }
      ],
      algorithms: [
        {
          name: "Obstacle-Avoiding A* Flight Router",
          description: "Custom path-finding loop that routes delivery vectors around temporary high-wind grids and safe-exclusion polygons.",
          pseudocode: "function computeAStarFlightPath(startNode, endNode, exclusionGrid, windVector):\n  openSet = [startNode]\n  cameFrom = empty_map()\n  gScore = map_with_default(infinity)\n  gScore[startNode] = 0\n  \n  while openSet is not empty:\n    current = node_with_lowest_fScore(openSet)\n    if current == endNode:\n      return reconstructPath(cameFrom, current)\n      \n    remove(openSet, current)\n    for neighbor in getNeighbors(current):\n      if exclusionGrid.contains(neighbor):\n        continue // Safe city zone bypass\n        \n      windCost = calculateWindResistance(current, neighbor, windVector)\n      tentative_gScore = gScore[current] + distance(current, neighbor) + windCost\n      \n      if tentative_gScore < gScore[neighbor]:\n        cameFrom[neighbor] = current\n        gScore[neighbor] = tentative_gScore\n        fScore[neighbor] = tentative_gScore + heuristic(neighbor, endNode)\n        if neighbor not in openSet:\n          push(openSet, neighbor)",
          complexity: "O(E * log V) space & time"
        }
      ],
      prompts: [
        {
          featureName: "Emergency Ground Dispatch Advisor",
          template: "You are the Flight Safety AI. A drone reports an emergency anomaly.\n\nContext Input:\n- Code: {{drone_id}}\n- Critical Failure: {{failure_type}}\n- Current Coordinate: {{gps_lat}}, {{gps_lon}}\n- Nearby Landing Zones: {{landing_zones_json}}\n\nTask:\nCalculate the immediate safest emergency touchdown route. Prioritize open fields or empty flat areas over industrial structures.\n\nJSON output:\n{\n  \"immediateAction\": \"DESCEND_NOW\" / \"CRASH_GLIDE\" / \"RETURN_TO_BASE\",\n  \"targetCoordinate\": [lat, lon],\n  \"safetyJustification\": \"...\"\n}",
          inputs: ["drone_id", "failure_type", "gps_lat", "gps_lon", "landing_zones_json"],
          outputs: ["immediateAction", "targetCoordinate", "safetyJustification"],
          guardrails: [
            "Exclusion coordinates must never intersect with crowded commercial spots.",
            "Always include battery consumption calculations in safety metrics."
          ]
        }
      ],
      risks: [
        {
          agentName: "Algorithm Auditor",
          riskType: "algorithm",
          severity: "high",
          description: "Wind updates are polled every 10 seconds, causing high memory recalculation loops if 500+ drones are synchronized.",
          recommendation: "Calculate flight plans as segments. Only trigger dynamic re-routing if localized wind sensors report variance greater than 15 knots."
        }
      ],
      open_questions: [
        "What are the drone regulations in bad weather?"
      ],
      final_spec: "# AeroSync Platform Specifications\n\n## 1. System Overview\nAeroSync coordinates commercial delivery drone dispatch in complex urban airspace. Utilizing real-time telemetry pipelines and automated path calculation engines, it ensures safety compliance and power efficiency.",
      design_elements: [
        {
          id: "seq_diag_aero",
          agent: "algorithm_designer",
          type: "mermaid_sequence",
          title: "AeroSync Real-time Obstacle Bypass Flow",
          description: "Dynamic visual modeling of drone sensor reports mapping path revisions.",
          content: "sequenceDiagram\n  autonumber\n  Drone->>Hub: Stream Coordinates\n  Hub->>Router: Compute Path\n  Router-->>Hub: Optimized Node Map\n  Hub-->>Drone: Direct Route Manifest"
        }
      ]
    },
    compiledFiles: [
      {
        language: "typescript",
        filename: "DroneRouter.ts",
        content: `export function calculateGridPath(start: [number, number], end: [number, number]) {
  console.log("Routing flight plan from", start, "to", end);
  return {
    pathNodes: [start, [start[0] + 0.1, start[1] + 0.1], end],
    windResistanceFactor: 1.25,
    estimatedMinutes: 14.5
  };
}`
      }
    ]
  }
];
