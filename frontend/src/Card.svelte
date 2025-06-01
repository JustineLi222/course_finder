<script>
    export let card;
    const { course_code ,title, professor, timeslot, location, quota,units, mode } = card;
</script>

<div class="card">
    <div class="card-body">
        <h2 class="card-title ">
            <div class="badge badge-warning">
                {course_code}
            </div>
            {title}
        </h2>
        <div class="text-muted card-text d-flex flex-column justify-content-between">
            <div class="professor">Professor: {professor}</div>
            <div class="timeslot mt-3">Timeslot: {timeslot}</div>
            <div class="location mt-3">Location: {location}</div>
            <div class=" mt-3">Quota: {quota}</div>
            <div class=" mt-3">Mode: {mode}</div>
            <div class=" mt-3">Units: {units}</div>

        </div>
        
    </div>
</div>

<style>
    button{
        width: fit-content;
    }
</style>