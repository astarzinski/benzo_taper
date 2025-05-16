from datetime import timedelta
from collections import defaultdict
import math

# Available tablet strengths for each medication
medication_doses = {
    "alprazolam": [0.25, 0.5, 1, 2],
    "lorazepam": [0.5, 1, 2],
    "clonazepam": [0.25, 0.5, 1, 2],
    "diazepam": [2, 5, 10],
}

# Define all steps in a dictionary
all_steps = {
    's1_0': (1, {'Morning': ('alprazolam', 2), 'Midday': ('alprazolam', 2),
                 'Night': ('alprazolam', 2)}, 's1_1'),
    's1_1': (1, {'Morning': ('alprazolam', 2), 'Midday': ('alprazolam', 2),
                 'Night': (('alprazolam', 1.5), ('diazepam', 10))}, 's1_2'),
    's1_2': (1, {'Morning': ('alprazolam', 2), 'Midday': ('alprazolam', 2),
                 'Night': (('alprazolam', 1), ('diazepam', 20))}, 's1_3'),
    's1_3': (1, {'Morning': (('alprazolam', 1.5), ('diazepam', 10)), 'Midday': ('alprazolam', 2),
                 'Night': (('alprazolam', 1), ('diazepam', 20))}, 's1_4'),
    's1_4': (1, {'Morning': (('alprazolam', 1), ('diazepam', 20)), 'Midday': ('alprazolam', 2),
                 'Night': (('alprazolam', 1), ('diazepam', 20))}, 's1_5'),
    's1_5': (2, {'Morning': (('alprazolam', 1), ('diazepam', 20)), 'Midday': (('alprazolam', 1), ('diazepam', 10)),
                 'Night': (('alprazolam', 1), ('diazepam', 20))}, 's1_6'),
    's1_6': (2, {'Morning': (('alprazolam', 1), ('diazepam', 20)), 'Midday': (('alprazolam', 1), ('diazepam', 10)),
                 'Night': (('alprazolam', 0.5), ('diazepam', 20))}, 's1_7'),
    's1_7': (2, {'Morning': (('alprazolam', 1), ('diazepam', 20)), 'Midday': (('alprazolam', 1), ('diazepam', 10)),
                 'Night': ('diazepam', 20)}, 's1_8'),
    's1_8': (2, {'Morning': (('alprazolam', 0.5), ('diazepam', 20)), 'Midday': (('alprazolam', 1), ('diazepam', 10)),
                 'Night': ('diazepam', 20)}, 's1_9'),
    's1_9': (2, {'Morning': (('alprazolam', 0.5), ('diazepam', 20)), 'Midday': (('alprazolam', 0.5), ('diazepam', 10)),
                 'Night': ('diazepam', 20)}, 's1_10'),
    's1_10': (2, {'Morning': (('alprazolam', 0.5), ('diazepam', 20)), 'Midday': ('diazepam', 10),
                  'Night': ('diazepam', 20)}, 's1_11'),
    's1_11': (2, {'Morning': ('diazepam', 20), 'Midday': ('diazepam', 10),
                  'Night': ('diazepam', 20)}, 's1_12'),
    's1_12': (2, {'Morning': ('diazepam', 25), 'Midday': False,
                  'Night': ('diazepam', 25)}, 's1_13'),
    's1_13': (2, {'Morning': ('diazepam', 20), 'Midday': False,
                  'Night': ('diazepam', 25)}, 's2_0'),
    's2_0': (2, {'Morning': ('diazepam', 20), 'Midday': False,
                 'Night': ('diazepam', 20)}, 's2_1'),
    's2_1': (2, {'Morning': ('diazepam', 18), 'Midday': False,
                 'Night': ('diazepam', 20)}, 's2_2'),
    's2_2': (2, {'Morning': ('diazepam', 18), 'Midday': False,
                 'Night': ('diazepam', 18)}, 's2_3'),
    's2_3': (2, {'Morning': ('diazepam', 16), 'Midday': False,
                 'Night': ('diazepam', 18)}, 's2_4'),
    's2_4': (2, {'Morning': ('diazepam', 16), 'Midday': False,
                 'Night': ('diazepam', 16)}, 's2_5'),
    's2_5': (2, {'Morning': ('diazepam', 14), 'Midday': False,
                 'Night': ('diazepam', 16)}, 's2_6'),
    's2_6': (2, {'Morning': ('diazepam', 14), 'Midday': False,
                 'Night': ('diazepam', 14)}, 's2_7'),
    's2_7': (2, {'Morning': ('diazepam', 12), 'Midday': False,
                 'Night': ('diazepam', 14)}, 's2_8'),
    's2_8': (2, {'Morning': ('diazepam', 12), 'Midday': False,
                 'Night': ('diazepam', 12)}, 's2_9'),
    's2_9': (2, {'Morning': ('diazepam', 10), 'Midday': False,
                 'Night': ('diazepam', 12)}, 's2_10'),
    's2_10': (2, {'Morning': ('diazepam', 10), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's2_11'),
    's2_11': (2, {'Morning': ('diazepam', 8), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's2_12'),
    's2_12': (2, {'Morning': ('diazepam', 8), 'Midday': False,
                  'Night': ('diazepam', 8)}, 's2_13'),
    's2_13': (2, {'Morning': ('diazepam', 6), 'Midday': False,
                  'Night': ('diazepam', 8)}, 's2_14'),
    's2_14': (2, {'Morning': ('diazepam', 5), 'Midday': False,
                  'Night': ('diazepam', 8)}, 's2_15'),
    's2_15': (2, {'Morning': ('diazepam', 4), 'Midday': False,
                  'Night': ('diazepam', 8)}, 's2_16'),
    's2_16': (2, {'Morning': ('diazepam', 3), 'Midday': False,
                  'Night': ('diazepam', 8)}, 's2_17'),
    's2_17': (2, {'Morning': ('diazepam', 2), 'Midday': False,
                  'Night': ('diazepam', 8)}, 's2_18'),
    's2_18': (2, {'Morning': ('diazepam', 1), 'Midday': False,
                  'Night': ('diazepam', 8)}, 's4_4'),
    's3_0': (1, {'Morning': ('lorazepam', 2), 'Midday': ('lorazepam', 2),
                 'Night': ('lorazepam', 2)}, 's3_1'),
    's3_1': (1, {'Morning': ('lorazepam', 2), 'Midday': ('lorazepam', 2),
                 'Night': (('lorazepam', 1), ('diazepam', 10))}, 's3_2'),
    's3_2': (1, {'Morning': (('lorazepam', 1.5), ('diazepam', 5)), 'Midday': ('lorazepam', 2),
                 'Night': (('lorazepam', 1), ('diazepam', 10))}, 's3_3'),
    's3_3': (1, {'Morning': (('lorazepam', 1.5), ('diazepam', 5)), 'Midday': ('lorazepam', 2),
                 'Night': (('lorazepam', 0.5), ('diazepam', 15))}, 's3_4'),
    's3_4': (1, {'Morning': (('lorazepam', 1.5), ('diazepam', 5)), 'Midday': (('lorazepam', 1.5), ('diazepam', 5)),
                 'Night': (('lorazepam', 0.5), ('diazepam', 15))}, 's3_5'),
    's3_5': (2, {'Morning': (('lorazepam', 1.5), ('diazepam', 5)), 'Midday': (('lorazepam', 1.5), ('diazepam', 5)),
                 'Night': ('diazepam', 20)}, 's3_6'),
    's3_6': (2, {'Morning': (('lorazepam', 1), ('diazepam', 5)), 'Midday': (('lorazepam', 1.5), ('diazepam', 5)),
                 'Night': ('diazepam', 20)}, 's3_7'),
    's3_7': (2, {'Morning': (('lorazepam', 1), ('diazepam', 5)), 'Midday': (('lorazepam', 1), ('diazepam', 5)),
                 'Night': ('diazepam', 20)}, 's3_8'),
    's3_8': (2, {'Morning': (('lorazepam', 0.5), ('diazepam', 5)), 'Midday': (('lorazepam', 1), ('diazepam', 5)),
                 'Night': ('diazepam', 20)}, 's3_9'),
    's3_9': (2, {'Morning': (('lorazepam', 0.5), ('diazepam', 5)), 'Midday': (('lorazepam', 0.5), ('diazepam', 5)),
                 'Night': ('diazepam', 20)}, 's3_10'),
    's3_10': (2, {'Morning': ('diazepam', 5), 'Midday': (('lorazepam', 0.5), ('diazepam', 5)),
                  'Night': ('diazepam', 20)}, 's3_11'),
    's3_11': (2, {'Morning': ('diazepam', 5), 'Midday': ('diazepam', 5),
                  'Night': ('diazepam', 20)}, 's3_12'),
    's3_12': (2, {'Morning': ('diazepam', 5), 'Midday': ('diazepam', 5),
                  'Night': ('diazepam', 18)}, 's3_13'),
    's3_13': (2, {'Morning': ('diazepam', 5), 'Midday': ('diazepam', 5),
                  'Night': ('diazepam', 16)}, 's3_14'),
    's3_14': (2, {'Morning': ('diazepam', 5), 'Midday': ('diazepam', 5),
                  'Night': ('diazepam', 14)}, 's3_15'),
    's3_15': (2, {'Morning': ('diazepam', 5), 'Midday': ('diazepam', 5),
                  'Night': ('diazepam', 12)}, 's3_16'),
    's3_16': (2, {'Morning': ('diazepam', 5), 'Midday': ('diazepam', 5),
                  'Night': ('diazepam', 10)}, 's3_17'),
    's3_17': (2, {'Morning': ('diazepam', 5), 'Midday': ('diazepam', 4),
                  'Night': ('diazepam', 10)}, 's3_18'),
    's3_18': (2, {'Morning': ('diazepam', 4), 'Midday': ('diazepam', 4),
                  'Night': ('diazepam', 10)}, 's3_19'),
    's3_19': (2, {'Morning': ('diazepam', 4), 'Midday': ('diazepam', 3),
                  'Night': ('diazepam', 10)}, 's3_20'),
    's3_20': (2, {'Morning': ('diazepam', 3), 'Midday': ('diazepam', 3),
                  'Night': ('diazepam', 10)}, 's3_21'),
    's3_21': (2, {'Morning': ('diazepam', 3), 'Midday': ('diazepam', 2),
                  'Night': ('diazepam', 10)}, 's3_22'),
    's3_22': (2, {'Morning': ('diazepam', 2), 'Midday': ('diazepam', 2),
                  'Night': ('diazepam', 10)}, 's3_23'),
    's3_23': (2, {'Morning': ('diazepam', 2), 'Midday': ('diazepam', 1),
                  'Night': ('diazepam', 10)}, 's3_24'),
    's3_24': (2, {'Morning': ('diazepam', 1), 'Midday': ('diazepam', 1),
                  'Night': ('diazepam', 10)}, 's3_25'),
    's3_25': (2, {'Morning': ('diazepam', 1), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's4_2'),
    's4_2': (1, {'Morning': False, 'Midday': False,
                 'Night': ('diazepam', 10)}, 's4_3'),
    's4_3': (2, {'Morning': False, 'Midday': False,
                 'Night': ('diazepam', 9)}, 's4_4'),
    's4_4': (2, {'Morning': False, 'Midday': False,
                 'Night': ('diazepam', 8)}, 's4_5'),
    's4_5': (2, {'Morning': False, 'Midday': False,
                 'Night': ('diazepam', 7)}, 's4_6'),
    's4_6': (2, {'Morning': False, 'Midday': False,
                 'Night': ('diazepam', 6)}, 's4_7'),
    's4_7': (2, {'Morning': False, 'Midday': False,
                 'Night': ('diazepam', 5)}, 's4_8'),
    's4_8': (2, {'Morning': False, 'Midday': False,
                 'Night': ('diazepam', 4)}, 's4_9'),
    's4_9': (2, {'Morning': False, 'Midday': False,
                 'Night': ('diazepam', 3)}, 's4_10'),
    's4_10': (2, {'Morning': False, 'Midday': False,
                  'Night': ('diazepam', 2)}, 's4_11'),
    's4_11': (2, {'Morning': False, 'Midday': False,
                  'Night': ('diazepam', 1)}, 'END'),
    's5_0': (1, {'Morning': ('clonazepam', 0.5), 'Midday': ('clonazepam', 0.5),
                 'Night': ('clonazepam', 0.5)}, 's5_1'),
    's5_1': (1, {'Morning': ('clonazepam', 0.5), 'Midday': ('clonazepam', 0.5),
                 'Night': (('clonazepam', 0.25), ('diazepam', 5))}, 's5_2'),
    's5_2': (1, {'Morning': ('clonazepam', 0.5), 'Midday': ('clonazepam', 0.5),
                 'Night': ('diazepam', 10)}, 's5_3'),
    's5_3': (1, {'Morning': (('clonazepam', 0.25), ('diazepam', 5)), 'Midday': ('clonazepam', 0.5),
                 'Night': ('diazepam', 10)}, 's5_4'),
    's5_4': (1, {'Morning': (('clonazepam', 0.25), ('diazepam', 5)), 'Midday': (('clonazepam', 0.25), ('diazepam', 5)),
                 'Night': ('diazepam', 10)}, 's5_5'),
    's5_5': (1, {'Morning': ('diazepam', 10), 'Midday': (('clonazepam', 0.25), ('diazepam', 5)),
                 'Night': ('diazepam', 10)}, 's5_6'),
    's5_6': (2, {'Morning': ('diazepam', 10), 'Midday': ('diazepam', 8),
                 'Night': ('diazepam', 10)}, 's5_7'),
    's5_7': (2, {'Morning': ('diazepam', 10), 'Midday': ('diazepam', 6),
                 'Night': ('diazepam', 10)}, 's5_8'),
    's5_8': (2, {'Morning': ('diazepam', 10), 'Midday': ('diazepam', 4),
                 'Night': ('diazepam', 10)}, 's5_9'),
    's5_9': (2, {'Morning': ('diazepam', 10), 'Midday': ('diazepam', 2),
                 'Night': ('diazepam', 10)}, 's5_10'),
    's5_10': (2, {'Morning': ('diazepam', 10), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's5_11'),
    's5_11': (2, {'Morning': ('diazepam', 8), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's5_12'),
    's5_12': (2, {'Morning': ('diazepam', 6), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's5_13'),
    's5_13': (2, {'Morning': ('diazepam', 4), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's5_14'),
    's5_14': (2, {'Morning': ('diazepam', 2), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's4_2'),
    's6_0': (1, {'Morning': ('clonazepam', 1), 'Midday': ('clonazepam', 1),
                 'Night': ('clonazepam', 1)}, 's6_1'),
    's6_1': (2, {'Morning': ('clonazepam', 1), 'Midday': ('clonazepam', 1),
                 'Night': (('clonazepam', 0.5), ('diazepam', 10))}, 's6_2'),
    's6_2': (2, {'Morning': (('clonazepam', 0.5), ('diazepam', 10)), 'Midday': ('clonazepam', 1),
                 'Night': (('clonazepam', 0.5), ('diazepam', 10))}, 's6_3'),
    's6_3': (2, {'Morning': (('clonazepam', 0.5), ('diazepam', 10)), 'Midday': (('clonazepam', 0.5), ('diazepam', 5)),
                 'Night': (('clonazepam', 0.5), ('diazepam', 10))}, 's6_4'),
    's6_4': (2, {'Morning': (('clonazepam', 0.5), ('diazepam', 10)), 'Midday': (('clonazepam', 0.5), ('diazepam', 5)),
                 'Night': ('diazepam', 15)}, 's6_5'),
    's6_5': (2, {'Morning': (('clonazepam', 0.25), ('diazepam', 10)), 'Midday': (('clonazepam', 0.5), ('diazepam', 5)),
                 'Night': ('diazepam', 15)}, 's6_6'),
    's6_6': (2, {'Morning': (('clonazepam', 0.25), ('diazepam', 10)), 'Midday': (('clonazepam', 0.25), ('diazepam', 5)),
                 'Night': ('diazepam', 15)}, 's6_7'),
    's6_7': (2, {'Morning': ('diazepam', 10), 'Midday': (('clonazepam', 0.25), ('diazepam', 5)),
                 'Night': ('diazepam', 15)}, 's6_8'),
    's6_8': (2, {'Morning': ('diazepam', 10), 'Midday': ('diazepam', 5),
                 'Night': ('diazepam', 15)}, 's6_9'),
    's6_9': (2, {'Morning': ('diazepam', 10), 'Midday': ('diazepam', 2.5),
                 'Night': ('diazepam', 15)}, 's6_10'),
    's6_10': (2, {'Morning': ('diazepam', 12), 'Midday': False,
                  'Night': ('diazepam', 15)}, 's6_11'),
    's6_11': (2, {'Morning': ('diazepam', 10), 'Midday': False,
                  'Night': ('diazepam', 15)}, 's6_12'),
    's6_12': (2, {'Morning': ('diazepam', 10), 'Midday': False,
                  'Night': ('diazepam', 14)}, 's6_13'),
    's6_13': (2, {'Morning': ('diazepam', 10), 'Midday': False,
                  'Night': ('diazepam', 12)}, 's5_10'),
    's8_0': (1, {'Morning': ('lorazepam', 1), 'Midday': ('lorazepam', 1),
                 'Night': ('lorazepam', 1)}, 's8_1'),
    's8_1': (1, {'Morning': ('lorazepam', 1), 'Midday': ('lorazepam', 1),
                 'Night': (('lorazepam', 0.5), ('diazepam', 5))}, 's8_2'),
    's8_2': (1, {'Morning': (('lorazepam', 0.5), ('diazepam', 5)), 'Midday': ('lorazepam', 1),
                 'Night': (('lorazepam', 0.5), ('diazepam', 5))}, 's8_3'),
    's8_3': (1, {'Morning': (('lorazepam', 0.5), ('diazepam', 5)), 'Midday': (('lorazepam', 0.5), ('diazepam', 5)),
                 'Night': (('lorazepam', 0.5), ('diazepam', 5))}, 's8_4'),
    's8_4': (1, {'Morning': (('lorazepam', 0.5), ('diazepam', 5)), 'Midday': (('lorazepam', 0.5), ('diazepam', 5)),
                 'Night': ('diazepam', 10)}, 's8_5'),
    's8_5': (1, {'Morning': ('diazepam', 10), 'Midday': (('lorazepam', 0.5), ('diazepam', 5)),
                 'Night': ('diazepam', 10)}, 's8_6'),
    's8_6': (1, {'Morning': ('diazepam', 10), 'Midday': ('diazepam', 10),
                 'Night': ('diazepam', 10)}, 's8_7'),
    's8_7': (2, {'Morning': ('diazepam', 10), 'Midday': ('diazepam', 8),
                 'Night': ('diazepam', 10)}, 's8_8'),
    's8_8': (2, {'Morning': ('diazepam', 8), 'Midday': ('diazepam', 8),
                 'Night': ('diazepam', 10)}, 's8_9'),
    's8_9': (2, {'Morning': ('diazepam', 8), 'Midday': ('diazepam', 6),
                 'Night': ('diazepam', 10)}, 's8_10'),
    's8_10': (2, {'Morning': ('diazepam', 6), 'Midday': ('diazepam', 6),
                  'Night': ('diazepam', 10)}, 's8_11'),
    's8_11': (2, {'Morning': ('diazepam', 6), 'Midday': ('diazepam', 4),
                  'Night': ('diazepam', 10)}, 's8_12'),
    's8_12': (2, {'Morning': ('diazepam', 6), 'Midday': ('diazepam', 2),
                  'Night': ('diazepam', 10)}, 's8_13'),
    's8_13': (2, {'Morning': ('diazepam', 6), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's8_14'),
    's8_14': (2, {'Morning': ('diazepam', 5), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's8_15'),
    's8_15': (2, {'Morning': ('diazepam', 4), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's8_16'),
    's8_16': (2, {'Morning': ('diazepam', 3), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's8_17'),
    's8_17': (2, {'Morning': ('diazepam', 2), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's8_18'),
    's8_18': (2, {'Morning': ('diazepam', 1), 'Midday': False,
                  'Night': ('diazepam', 10)}, 's4_2'),
    's13_0': (2, {'Morning': ('alprazolam', 3), 'Midday': ('alprazolam', 3), 
                  'Night': ('alprazolam', 3)}, 's13_1'),
    's13_1': (2, {'Morning': ('alprazolam', 3), 'Midday': ('alprazolam', 3), 
                  'Night': (('alprazolam', 2.5), ('diazepam', 10))}, 's13_2'),
    's13_2': (2, {'Morning': ('alprazolam', 3), 'Midday': ('alprazolam', 3), 
                  'Night': (('alprazolam', 2), ('diazepam', 20))}, 's13_3'),
    's13_3': (2, {'Morning': (('alprazolam', 2.5), ('diazepam', 10)), 'Midday': ('alprazolam', 3), 
                  'Night': (('alprazolam', 2), ('diazepam', 20))}, 's13_4'),
    's13_4': (2, {'Morning': (('alprazolam', 2), ('diazepam', 20)), 'Midday': ('alprazolam', 3), 
                  'Night': (('alprazolam', 2), ('diazepam', 20))}, 's13_5'),
    's13_5': (2, {'Morning': (('alprazolam', 2), ('diazepam', 20)), 'Midday': (('alprazolam', 2), ('diazepam', 10)), 
                  'Night': (('alprazolam', 2), ('diazepam', 20))}, 's13_6'),
    's13_6': (2, {'Morning': (('alprazolam', 2), ('diazepam', 20)), 'Midday': (('alprazolam', 2), ('diazepam', 10)), 
                  'Night': (('alprazolam', 1.5), ('diazepam', 20))}, 's13_7'),
    's13_7': (2, {'Morning': (('alprazolam', 2), ('diazepam', 20)), 'Midday': (('alprazolam', 2), ('diazepam', 10)), 
                  'Night': (('alprazolam', 1), ('diazepam', 20))}, 's13_8'),
    's13_8': (2, {'Morning': (('alprazolam', 1.5), ('diazepam', 20)), 'Midday': (('alprazolam', 2), ('diazepam', 10)), 
                  'Night': (('alprazolam', 1), ('diazepam', 20))}, 's13_9'),
    's13_9': (2, {'Morning': (('alprazolam', 1.5), ('diazepam', 20)), 'Midday': (('alprazolam', 1.5), ('diazepam', 10)), 
                  'Night': (('alprazolam', 1), ('diazepam', 20))}, 's13_10'),
    's13_10': (2, {'Morning': (('alprazolam', 1.5), ('diazepam', 20)), 'Midday': (('alprazolam', 1), ('diazepam', 10)), 
                  'Night': (('alprazolam', 1), ('diazepam', 20))}, 's1_5'),
    's14_0': (2, {'Morning': ('alprazolam', 2.5), 'Midday': ('alprazolam', 2.5), 
                  'Night': ('alprazolam', 2.5)}, 's14_1'),
    's14_1': (2, {'Morning': ('alprazolam', 2.5), 'Midday': ('alprazolam', 2.5), 
                  'Night': (('alprazolam', 2), ('diazepam', 10))}, 's14_2'),
    's14_2': (2, {'Morning': ('alprazolam', 2.5), 'Midday': ('alprazolam', 2.5), 
                  'Night': (('alprazolam', 1.5), ('diazepam', 20))}, 's14_3'),
    's14_3': (2, {'Morning': (('alprazolam', 2), ('diazepam', 10)), 'Midday': ('alprazolam', 2.5), 
                  'Night': (('alprazolam', 1.5), ('diazepam', 20))}, 's14_4'),
    's14_4': (2, {'Morning': (('alprazolam', 1.5), ('diazepam', 20)), 'Midday': ('alprazolam', 2.5), 
                  'Night': (('alprazolam', 1.5), ('diazepam', 20))}, 's14_5'),
    's14_5': (2, {'Morning': (('alprazolam', 1.5), ('diazepam', 20)), 'Midday': (('alprazolam', 1.5), ('diazepam', 10)), 
                  'Night': (('alprazolam', 1.5), ('diazepam', 20))}, 's14_6'),
    's14_6': (2, {'Morning': (('alprazolam', 1.5), ('diazepam', 20)), 'Midday': (('alprazolam', 1.5), ('diazepam', 10)), 
                  'Night': (('alprazolam', 1), ('diazepam', 20))}, 's14_7'),
    's14_7': (2, {'Morning': (('alprazolam', 1), ('diazepam', 20)), 'Midday': (('alprazolam', 1.5), ('diazepam', 10)), 
                  'Night': (('alprazolam', 1), ('diazepam', 20))}, 's1_5'),
    's15_0': (2, {'Morning': ('alprazolam', 1.5), 'Midday': ('alprazolam', 1.5), 
                  'Night': ('alprazolam', 1.5)}, 's15_1'),
    's15_1': (2, {'Morning': ('alprazolam', 1.5), 'Midday': ('alprazolam', 1.5), 
                  'Night': (('alprazolam', 1), ('diazepam', 10))}, 's15_2'),
    's15_2': (2, {'Morning': (('alprazolam', 1), ('diazepam', 10)), 'Midday': ('alprazolam', 1.5), 
                  'Night': (('alprazolam', 1), ('diazepam', 10))}, 's15_3'),
    's15_3': (2, {'Morning': (('alprazolam', 1), ('diazepam', 10)), 'Midday': (('alprazolam', 1), ('diazepam', 10)), 
                  'Night': (('alprazolam', 1), ('diazepam', 10))}, 's15_4'),
    's15_4': (2, {'Morning': (('alprazolam', 1), ('diazepam', 10)), 'Midday': (('alprazolam', 1), ('diazepam', 10)), 
                  'Night': (('alprazolam', 0.5), ('diazepam', 20))}, 's15_5'),
    's15_5': (2, {'Morning': (('alprazolam', 0.5), ('diazepam', 20)), 'Midday': (('alprazolam', 1), ('diazepam', 10)), 
                  'Night': (('alprazolam', 0.5), ('diazepam', 20))}, 's1_8'),
    's16_0': (2, {'Morning': ('alprazolam', 1), 'Midday': ('alprazolam', 1), 
                  'Night': ('alprazolam', 1)}, 's16_1'),
    's16_1': (2, {'Morning': ('alprazolam', 1), 'Midday': ('alprazolam', 1), 
                  'Night': (('alprazolam', 0.5), ('diazepam', 10))}, 's16_2'),
    's16_2': (2, {'Morning': (('alprazolam', 0.5), ('diazepam', 10)), 'Midday': ('alprazolam', 1), 
                  'Night': (('alprazolam', 0.5), ('diazepam', 10))}, 's16_3'),
    's16_3': (2, {'Morning': (('alprazolam', 0.5), ('diazepam', 10)), 'Midday': (('alprazolam', 0.5), ('diazepam', 10)), 
                  'Night': (('alprazolam', 0.5), ('diazepam', 10))}, 's16_4'),
    's16_4': (2, {'Morning': (('alprazolam', 0.5), ('diazepam', 10)), 'Midday': (('alprazolam', 0.5), ('diazepam', 10)), 
                  'Night': ('diazepam', 20)}, 's16_5'),
    's16_5': (2, {'Morning': ('diazepam', 20), 'Midday': (('alprazolam', 0.5), ('diazepam', 10)), 
                  'Night': ('diazepam', 20)}, 's1_11'),
    's17_0': (2, {'Morning': ('alprazolam', 0.5), 'Midday': ('alprazolam', 0.5), 
                  'Night': ('alprazolam', 0.5)}, 's17_1'),
    's17_1': (2, {'Morning': ('alprazolam', 0.5), 'Midday': ('alprazolam', 0.5), 
                  'Night': (('alprazolam', .25), ('diazepam', 5))}, 's17_2'),
    's17_2': (2, {'Morning': (('alprazolam', .25), ('diazepam', 5)), 'Midday': ('alprazolam', 0.5), 
                  'Night': (('alprazolam', .25), ('diazepam', 5))}, 's17_3'),
    's17_3': (2, {'Morning': (('alprazolam', .25), ('diazepam', 5)), 'Midday': (('alprazolam', .25), ('diazepam', 5)), 
                  'Night': (('alprazolam', .25), ('diazepam', 5))}, 's17_4'),
    's17_4': (2, {'Morning': (('alprazolam', .25), ('diazepam', 5)), 'Midday': (('alprazolam', .25), ('diazepam', 5)), 
                  'Night': ('diazepam', 10)}, 's17_5'),
    's17_5': (2, {'Morning': ('diazepam', 10), 'Midday': (('alprazolam', .25), ('diazepam', 5)), 
                  'Night': ('diazepam', 10)}, 's17_6'),
    's17_6': (2, {'Morning': ('diazepam', 10), 'Midday': ('diazepam', 10), 
                  'Night': ('diazepam', 10)}, 's17_7'),
    's17_7': (2, {'Morning': ('diazepam', 15), 'Midday': False, 
                  'Night': ('diazepam', 15)}, 's2_6'),
    's18_0': (2, {'Morning': ('lorazepam', 3), 'Midday': ('lorazepam', 3), 
                  'Night': ('lorazepam', 3)}, 's18_1'),
    's18_1': (2, {'Morning': ('lorazepam', 3), 'Midday': ('lorazepam', 3), 
                  'Night': (('lorazepam', 2), ('diazepam', 10))}, 's18_2'),
    's18_2': (2, {'Morning': (('lorazepam', 2), ('diazepam', 10)), 'Midday': ('lorazepam', 3), 
                  'Night': (('lorazepam', 2), ('diazepam', 10))}, 's18_3'),
    's18_3': (2, {'Morning': (('lorazepam', 2), ('diazepam', 10)), 'Midday': (('lorazepam', 2), ('diazepam', 10)), 
                  'Night': (('lorazepam', 2), ('diazepam', 10))}, 's18_4'),
    's18_4': (2, {'Morning': (('lorazepam', 2), ('diazepam', 10)), 'Midday': (('lorazepam', 2), ('diazepam', 10)), 
                  'Night': (('lorazepam', 1), ('diazepam', 20))}, 's18_5'),
    's18_5': (2, {'Morning': (('lorazepam', 1.5), ('diazepam', 15)), 'Midday': (('lorazepam', 2), ('diazepam', 10)), 
                  'Night': (('lorazepam', 1), ('diazepam', 20))}, 's18_6'),
    's18_6': (2, {'Morning': (('lorazepam', 1), ('diazepam', 20)), 'Midday': (('lorazepam', 2), ('diazepam', 10)), 
                  'Night': (('lorazepam', 1), ('diazepam', 20))}, 's18_7'),
    's18_7': (2, {'Morning': (('lorazepam', 1), ('diazepam', 20)), 'Midday': (('lorazepam', 1.5), ('diazepam', 10)), 
                  'Night': (('lorazepam', 1), ('diazepam', 20))}, 's18_8'),
    's18_8': (2, {'Morning': (('lorazepam', 1), ('diazepam', 20)), 'Midday': (('lorazepam', 1), ('diazepam', 10)), 
                  'Night': (('lorazepam', 1), ('diazepam', 20))}, 's18_9'),
    's18_9': (2, {'Morning': (('lorazepam', 1), ('diazepam', 20)), 'Midday': (('lorazepam', 1), ('diazepam', 10)), 
                  'Night': (('lorazepam', 0.5), ('diazepam', 20))}, 's18_10'),
    's18_10': (2, {'Morning': (('lorazepam', 0.5), ('diazepam', 20)), 'Midday': (('lorazepam', 1), ('diazepam', 10)), 
                  'Night': (('lorazepam', 0.5), ('diazepam', 20))}, 's18_11'),
    's18_11': (2, {'Morning': (('lorazepam', 0.5), ('diazepam', 20)), 'Midday': (('lorazepam', 0.5), ('diazepam', 10)), 
                  'Night': (('lorazepam', 0.5), ('diazepam', 20))}, 's18_12'),
    's18_12': (2, {'Morning': (('lorazepam', 0.5), ('diazepam', 20)), 'Midday': (('lorazepam', 0.5), ('diazepam', 10)), 
                  'Night': ('diazepam', 20)}, 's18_13'),
    's18_13': (2, {'Morning': ('diazepam', 20), 'Midday': (('lorazepam', 0.5), ('diazepam', 10)), 
                  'Night': ('diazepam', 20)}, 's1_11'),
    's19_0': (2, {'Morning': ('lorazepam', 2.5), 'Midday': ('lorazepam', 2.5), 
                  'Night': ('lorazepam', 2.5)}, 's19_1'),
    's19_1': (2, {'Morning': ('lorazepam', 2.5), 'Midday': ('lorazepam', 2.5), 
                  'Night': (('lorazepam', 1.5), ('diazepam', 10))}, 's19_2'),
    's19_2': (2, {'Morning': (('lorazepam', 1.5), ('diazepam', 10)), 'Midday': ('lorazepam', 2.5), 
                  'Night': (('lorazepam', 1.5), ('diazepam', 10))}, 's19_3'),
    's19_3': (2, {'Morning': (('lorazepam', 1.5), ('diazepam', 10)), 'Midday': (('lorazepam', 2), ('diazepam', 5)), 
                  'Night': (('lorazepam', 1.5), ('diazepam', 10))}, 's19_4'),
    's19_4': (2, {'Morning': (('lorazepam', 1.5), ('diazepam', 10)), 'Midday': (('lorazepam', 2), ('diazepam', 5)), 
                  'Night': (('lorazepam', 1), ('diazepam', 15))}, 's19_5'),
    's19_5': (2, {'Morning': (('lorazepam', 1.5), ('diazepam', 10)), 'Midday': (('lorazepam', 1.5), ('diazepam', 10)), 
                  'Night': (('lorazepam', 1), ('diazepam', 15))}, 's19_6'),
    's19_6': (2, {'Morning': (('lorazepam', 1), ('diazepam', 15)), 'Midday': (('lorazepam', 1.5), ('diazepam', 10)), 
                  'Night': (('lorazepam', 1), ('diazepam', 15))}, 's19_7'),
    's19_7': (2, {'Morning': (('lorazepam', 1), ('diazepam', 15)), 'Midday': (('lorazepam', 1), ('diazepam', 10)), 
                  'Night': (('lorazepam', 1), ('diazepam', 15))}, 's19_8'),
    's19_8': (2, {'Morning': (('lorazepam', 1), ('diazepam', 15)), 'Midday': (('lorazepam', 1), ('diazepam', 10)), 
                  'Night': (('lorazepam', 0.5), ('diazepam', 20))}, 's18_10'),
    's20_0': (2, {'Morning': ('lorazepam', 1.5), 'Midday': ('lorazepam', 1.5), 
                  'Night': ('lorazepam', 1.5)}, 's20_1'),
    's20_1': (2, {'Morning': ('lorazepam', 1.5), 'Midday': ('lorazepam', 1.5), 
                  'Night': (('lorazepam', 1), ('diazepam', 5))}, 's20_2'),
    's20_2': (2, {'Morning': (('lorazepam', 1), ('diazepam', 5)), 'Midday': ('lorazepam', 1.5), 
                  'Night': (('lorazepam', 1), ('diazepam', 5))}, 's20_3'),
    's20_3': (2, {'Morning': (('lorazepam', 1), ('diazepam', 5)), 'Midday': (('lorazepam', 1), ('diazepam', 5)), 
                  'Night': (('lorazepam', 1), ('diazepam', 5))}, 's20_4'),
    's20_4': (2, {'Morning': (('lorazepam', 1), ('diazepam', 5)), 'Midday': (('lorazepam', 1), ('diazepam', 5)), 
                  'Night': (('lorazepam', 0.5), ('diazepam', 10))}, 's20_5'),
    's20_5': (2, {'Morning': (('lorazepam', 0.5), ('diazepam', 10)), 'Midday': (('lorazepam', 1), ('diazepam', 5)), 
                  'Night': (('lorazepam', 0.5), ('diazepam', 10))}, 's20_6'),
    's20_6': (2, {'Morning': (('lorazepam', 0.5), ('diazepam', 10)), 'Midday': (('lorazepam', 1), ('diazepam', 5)), 
                  'Night': ('diazepam', 15)}, 's20_7'),
    's20_7': (2, {'Morning': ('diazepam', 15), 'Midday': (('lorazepam', 1), ('diazepam', 5)), 
                  'Night': ('diazepam', 15)}, 's20_8'),
    's20_8': (2, {'Morning': ('diazepam', 15), 'Midday': (('lorazepam', 0.5), ('diazepam', 5)), 
                  'Night': ('diazepam', 20)}, 's20_9'),
    's20_9': (2, {'Morning': ('diazepam', 20), 'Midday': ('diazepam', 5), 
                  'Night': ('diazepam', 20)}, 's20_10'),
    's20_10': (2, {'Morning': ('diazepam', 22.5), 'Midday': False, 
                  'Night': ('diazepam', 22.5)}, 's20_11'),
    's20_11': (2, {'Morning': ('diazepam', 22.5), 'Midday': False, 
                  'Night': ('diazepam', 20)}, 's2_0'),
    's21_0': (2, {'Morning': ('lorazepam', 1), 'Midday': ('lorazepam', 1), 
                  'Night': ('lorazepam', 1)}, 's21_1'),
    's21_1': (2, {'Morning': ('lorazepam', 1), 'Midday': ('lorazepam', 1), 
                  'Night': (('lorazepam', 0.5), ('diazepam', 5))}, 's21_2'),
    's21_2': (2, {'Morning': (('lorazepam', 0.5), ('diazepam', 5)), 'Midday': ('lorazepam', 1), 
                  'Night': (('lorazepam', 0.5), ('diazepam', 5))}, 's21_3'),
    's21_3': (2, {'Morning': (('lorazepam', 0.5), ('diazepam', 5)), 'Midday': (('lorazepam', 0.5), ('diazepam', 5)), 
                  'Night': (('lorazepam', 0.5), ('diazepam', 5))}, 's8_4'),
    's22_0': (2, {'Morning': ('lorazepam', 0.5), 'Midday': ('lorazepam', 0.5), 
                  'Night': ('lorazepam', 0.5)}, 's22_1'),
    's22_1': (2, {'Morning': ('lorazepam', 0.5), 'Midday': ('lorazepam', 0.5), 
                  'Night': ('diazepam', 5)}, 's22_2'),
    's22_2': (2, {'Morning': ('diazepam', 5), 'Midday': ('lorazepam', 0.5), 
                  'Night': ('diazepam', 5)}, 's22_3'),
    's22_3': (2, {'Morning': ('diazepam', 5), 'Midday': ('diazepam', 5), 
                  'Night': ('diazepam', 5)}, 's22_4'),
    's22_4': (2, {'Morning': ('diazepam', 7.5), 'Midday': False, 
                  'Night': ('diazepam', 7.5)}, 's2_13'),
}

# map small integers to words for user‐friendly instructions
NUM_WORDS = {
    0: "zero", 1: "one", 2: "two", 3: "three", 4: "four",
    5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine",
    10: "ten"
}
def num_to_words(n):
    return NUM_WORDS.get(n, str(n))

# grammatical connectors for time‐of‐day
time_preps = {
    'Morning': 'in the Morning',
    'Midday': 'at Midday',
    'Night': 'at Night'
}

def get_schedule_steps(start_step, start_date):
    """
    Walk through all_steps from `start_step` on `start_date`,
    returning a list of {step_name, weeks, times, start_date, end_date}.
    """
    step = start_step
    current = start_date
    out = []
    while True:
        if step not in all_steps:
            raise KeyError(f"Step '{step}' not found in taper definition")
        weeks, times, nxt = all_steps[step]
        start = current
        end   = current + timedelta(days=weeks*7 - 1)
        out.append({
            "step_name": step,
            "weeks": weeks,
            "times": times,
            "start_date": start,
            "end_date": end
        })
        if nxt == "END":
            break
        current = end + timedelta(days=1)
        step = nxt
    return out

def breakdown_with_strengths(med, dose, strengths):
    """
    Express `dose` mg as whole or half tablets of the given `strengths`.
    Returns {strength: count}, raising ValueError if impossible.
    """
    rem = dose
    counts = {}
    for s in sorted(strengths, reverse=True):
        w = int(rem // s)
        if w:
            counts[s] = w
            rem -= w * s
    if abs(rem) < 1e-6:
        return counts
    for s in sorted(strengths, reverse=True):
        if abs(rem - s/2) < 1e-6:
            counts[s] = counts.get(s, 0) + 0.5
            return counts
    raise ValueError(f"Cannot break down {dose}mg {med} with {strengths}")

def select_strengths(med, required_doses):
    """
    Choose up to two tablet strengths that:
      1. Cover every required dose (whole or half tablets only).
      2. Prefer combos that allow at least one whole tablet.
      3. Exclude a “one‐off” strength if the other alone can cover that single dose.
      4. Minimize total tablets per administration.
      5. Tiebreak by fewer strengths.
    Returns (strengths_tuple, {dose: breakdown_dict, …}).
    """
    avail = medication_doses[med]
    combos = [(s,) for s in avail]
    for i in range(len(avail)):
        for j in range(i+1, len(avail)):
            combos.append((avail[i], avail[j]))

    candidates = []
    for combo in combos:
        try:
            bd_map = {}
            total_tabs = 0.0
            half_count = 0
            for d in required_doses:
                bd = breakdown_with_strengths(med, d, combo)
                bd_map[d] = bd
                for cnt in bd.values():
                    total_tabs += cnt
                    if abs((cnt - int(cnt)) - 0.5) < 1e-6:
                        half_count += 1
            candidates.append((combo, bd_map, total_tabs, half_count))
        except ValueError:
            pass

    # 2) prefer combos allowing some whole tablet
    whole_ok = [
        c for c in candidates
        if c[3]==0 or any(int(cnt)>0 for bd in c[1].values() for cnt in bd.values())
    ]
    if whole_ok:
        candidates = whole_ok

    # 3) drop “one-off” strength in two-strength combos
    filtered = []
    for combo, bd_map, tot, half_cnt in candidates:
        if len(combo)==2:
            drop = False
            for s in combo:
                uses = [d for d, bd in bd_map.items() if bd.get(s,0)>0]
                if len(uses)==1:
                    other = [x for x in combo if x!=s][0]
                    try:
                        bd_o = breakdown_with_strengths(med, uses[0], (other,))
                        if all(float(q).is_integer() for q in bd_o.values()):
                            drop = True
                            break
                    except ValueError:
                        pass
            if drop:
                continue
        filtered.append((combo, bd_map, tot, half_cnt))
    if filtered:
        candidates = filtered

    # 4+5) pick lowest tablets, then fewest strengths
    candidates.sort(key=lambda x: (x[2], len(x[0])))
    best_combo, best_bd, _, _ = candidates[0]
    return best_combo, best_bd

def prescriptions_for_step(step):
    """
    Given one step dict from get_schedule_steps, return a list of
    {step, medication, dose, instructions, quantity} dicts.
    """
    out = []
    name  = step["step_name"]
    weeks = step["weeks"]
    start_txt = step["start_date"].strftime("%m/%d/%Y")
    end_txt   = step["end_date"].strftime("%m/%d/%Y")

    # collect times-of-day per (med, dose)
    med_times = defaultdict(list)
    for tod, meds in step["times"].items():
        if not meds:
            continue
        meds_list = meds if isinstance(meds[0], tuple) else [meds]
        for m, d in meds_list:
            med_times[(m,d)].append(tod)

    for med in sorted({m for (m,_) in med_times}):
        doses = [d for (m,d) in med_times if m==med]
        strengths, bd_map = select_strengths(med, doses)

        for s in strengths:
            # tally total per time slot
            time_totals = defaultdict(float)
            for d in doses:
                cnt = bd_map[d].get(s,0)
                if cnt:
                    for tod in med_times[(med,d)]:
                        time_totals[tod] += cnt

            if not time_totals:
                continue

            # build plain-English phrases
            phrases = []
            for tod in ("Morning","Midday","Night"):
                if tod not in time_totals:
                    continue
                total = time_totals[tod]
                whole = int(total)
                frac  = total - whole
                prep = time_preps[tod]

                if abs(frac)<1e-6:
                    word = num_to_words(whole)
                    phr = f"{word} tablet{'s' if whole>1 else ''} of {s}mg {med} {prep}"
                else:
                    if whole==0:
                        phr = f"half a {s}mg tablet of {med} {prep}"
                    elif whole==1:
                        phr = f"one and a half tablets of {s}mg {med} {prep}"
                    else:
                        word = num_to_words(whole)
                        phr = (f"{word} and a half tablets of {s}mg "
                               f"{med} {prep}")
                phrases.append(phr)

            # total qty for entire step
            daily_tabs = sum(time_totals.values())
            qty = math.ceil(daily_tabs * weeks * 7)

            # join into single instruction
            if len(phrases)==1:
                instr = "Take " + phrases[0]
            else:
                instr = "Take " + ", ".join(phrases[:-1]) \
                        + ", and " + phrases[-1]
            instr += f" for {weeks} week{'s' if weeks>1 else ''} " \
                     f"(from {start_txt} to {end_txt})."

            out.append({
                "step": name,
                "medication": med,
                "dose": s,
                "instructions": instr,
                "quantity": qty
            })

    return out
