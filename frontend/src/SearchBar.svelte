<script>
 import MdSearch from 'svelte-icons/md/MdSearch.svelte'
 export let search_bar_question = "";
 export let onSearch; // Add this to handle search

 let inputValue = ""; // Local state for input value

 function handleKeyDown(event) {
    if (event.key === 'Enter') {
        search_bar_question = inputValue; // Update parent's value
        onSearch(inputValue); // Trigger search
    }
 }
</script>

<div class="search-bar w-100 d-flex justify-content-center align-items-center">
        <span id="searchicon"><MdSearch/></span>
        <input 
            type="text" 
            placeholder="Search for course" 
            bind:value={inputValue}
            on:keydown={handleKeyDown}
        >
</div>

<style>

#searchicon{

font-size: 20px;

width:20px;

height:20px;

margin-left: 15px;

margin: auto 0 auto 15px;
}

input{

cursor: pointer;

width: 100%;

border: none;

outline: none;

font-size: 16px;

margin: auto;
background-color: transparent;
height: 20px;

}

.search-bar{

height: 50px;

background-color: rgb(243,237,247);

border: 1px solid #ccc;

border-radius: 5px;

/* margin-top: 100px !important; */

}

</style>